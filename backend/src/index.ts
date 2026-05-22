import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb, run, all, get, withClient, batchInsert, batchUpdate, batchDelete, checkExisting } from './db';
import { parsePdf } from './pdfParser';

const app = express();
const PORT = process.env.PORT || 7860;

app.use(cors());
app.use(express.json());

// 初始化数据库
async function startServer() {
  await initDb();

  // 托管前端静态文件
  const staticDir = path.join(__dirname, '../public');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    
    // SPA fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // 确保uploads目录存在
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // 配置文件上传
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });

  const upload = multer({ storage });

  // API 路由

  // 登录接口
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'carlos' && password === 'swq') {
      // 生成简单的token
      const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      res.json({ success: true, token, username });
    } else {
      res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
  });

  // 导入PDF文件
  app.post('/api/import', upload.single('file'), async (req, res) => {
    try {
      console.log('[Import] Starting import process...');
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('[Import] Parsing PDF file...');
      const filePath = req.file.path;
      const parseResult = await parsePdf(filePath);
      const { words, errors } = parseResult;
      console.log(`[Import] Parsed ${words.length} words, ${errors.length} errors`);

      console.log('[Import] Starting database operations...');
      
      // 使用事务确保数据一致性
      await withClient(async (client) => {
        console.log('[Import] Transaction started');
        
        await client.query('BEGIN');
        
        try {
          // 先插入导入文件记录
          console.log('[Import] Creating import file record...');
          await client.query('INSERT INTO import_files (filename) VALUES ($1)', [req.file!.originalname]);
          const importFileResult = await client.query('SELECT id FROM import_files ORDER BY id DESC LIMIT 1');
          const importFileId = importFileResult.rows[0]?.id || 0;
          console.log(`[Import] Import file ID: ${importFileId}`);

          // 批量保存错误日志
          if (errors.length > 0) {
            console.log('[Import] Saving error logs...');
            const errorValues = errors.map(e => [importFileId, e.index, e.english, e.reason]);
            const batchSize = 100;
            
            for (let i = 0; i < errorValues.length; i += batchSize) {
              const batch = errorValues.slice(i, i + batchSize);
              const placeholders = batch.map((_, rowIndex) => 
                `($${rowIndex * 4 + 1}, $${rowIndex * 4 + 2}, $${rowIndex * 4 + 3}, $${rowIndex * 4 + 4})`
              ).join(', ');
              
              await client.query(
                `INSERT INTO import_error_logs (import_file_id, index_number, english, reason) VALUES ${placeholders}`,
                batch.flat()
              );
            }
            console.log('[Import] Error logs saved');
          }

          // 清空现有单词
          console.log('[Import] Clearing existing words...');
          await client.query('DELETE FROM word_relations');
          await client.query('DELETE FROM words');
          console.log('[Import] Existing words cleared');

          // 批量插入单词 - 这是性能提升的关键
          if (words.length > 0) {
            console.log(`[Import] Inserting ${words.length} words in batches...`);
            const wordValues = words.map(w => [w.english, w.part_of_speech, w.chinese, 0]);
            const batchSize = 100;
            
            for (let i = 0; i < wordValues.length; i += batchSize) {
              const batch = wordValues.slice(i, i + batchSize);
              const placeholders = batch.map((_, rowIndex) => 
                `($${rowIndex * 4 + 1}, $${rowIndex * 4 + 2}, $${rowIndex * 4 + 3}, $${rowIndex * 4 + 4})`
              ).join(', ');
              
              await client.query(
                'INSERT INTO words (english, part_of_speech, chinese, is_classified) VALUES ' + placeholders,
                batch.flat()
              );
              
              if ((i + batchSize) % 1000 === 0 || i + batchSize >= wordValues.length) {
                console.log(`[Import] Inserted ${Math.min(i + batchSize, wordValues.length)} words`);
              }
            }
          }

          await client.query('COMMIT');
          console.log('[Import] Database transaction committed successfully');
          
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('[Import] Rollback due to error:', error);
          throw error;
        }
      });

      // 后台触发自动分类
      console.log('[Import] Scheduling auto-classification...');
      setTimeout(async () => {
        try {
          console.log('[Classification] Starting auto-classification...');
          
          const allWords = await all('SELECT * FROM words');
          const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');
          console.log(`[Classification] Classifying ${allWords.length} words with ${rules.length} rules...`);
          
          const wordIndex = new Map<string, number>();
          allWords.forEach(w => {
            wordIndex.set(w.english.toLowerCase(), w.id);
          });

          const relationsToInsert: Array<{ root: number, child: number, type: string }> = [];
          const processedIds: number[] = [];

          for (const word of allWords) {
            const english = word.english.toLowerCase().trim();
            let wasClassified = false;
            
            if (english.includes(' ')) {
              const coreWord = extractCoreWord(english, wordIndex);
              if (coreWord && coreWord !== word.id) {
                // 检查是否已存在
                const existing = await get('SELECT id FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                  [coreWord, word.id, 'phrase']);
                if (!existing) {
                  relationsToInsert.push({ root: coreWord, child: word.id, type: 'phrase' });
                  wasClassified = true;
                }
              }
            } else {
              const rootWord = findRootWord(english, wordIndex, rules);
              if (rootWord && rootWord !== word.id) {
                const existing = await get('SELECT id FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                  [rootWord, word.id, 'derivative']);
                if (!existing) {
                  relationsToInsert.push({ root: rootWord, child: word.id, type: 'derivative' });
                  wasClassified = true;
                }
              }
            }
            
            if (wasClassified) {
              processedIds.push(word.id);
            }
          }

          // 批量插入关系
          if (relationsToInsert.length > 0) {
            console.log(`[Classification] Inserting ${relationsToInsert.length} relations...`);
            
            await withClient(async (client) => {
              await client.query('BEGIN');
              try {
                const batchSize = 100;
                for (let i = 0; i < relationsToInsert.length; i += batchSize) {
                  const batch = relationsToInsert.slice(i, i + batchSize);
                  const placeholders = batch.map((_, rowIndex) => 
                    `($${rowIndex * 3 + 1}, $${rowIndex * 3 + 2}, $${rowIndex * 3 + 3})`
                  ).join(', ');
                  
                  await client.query(
                    'INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ' + placeholders,
                    batch.flatMap(r => [r.root, r.child, r.type])
                  );
                }
                
                // 批量更新 is_classified
                if (processedIds.length > 0) {
                  const placeholders = processedIds.map((_, i) => `$${i + 1}`).join(',');
                  await client.query(`UPDATE words SET is_classified = 1 WHERE id IN (${placeholders})`, processedIds);
                }
                
                await client.query('COMMIT');
                console.log('[Classification] Auto-classification completed successfully');
              } catch (error) {
                await client.query('ROLLBACK');
                throw error;
              }
            });
          }

          console.log('[Classification] Auto-classification finished');
        } catch (e) {
          console.error('[Classification] Auto classification failed:', e);
        }
      }, 500);

      console.log('[Import] Import process completed successfully');
      res.json({ success: true, count: words.length, errorCount: errors.length, errors });
    } catch (error) {
      console.error('[Import] Import error:', error);
      res.status(500).json({ error: 'Failed to import file', details: String(error) });
    }
  });

  // 获取导入错误日志
  app.get('/api/import-errors', async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const errors = await all(`
      SELECT 
        import_error_logs.*,
        import_files.filename,
        import_files.imported_at
      FROM import_error_logs 
      LEFT JOIN import_files ON import_error_logs.import_file_id = import_files.id
      ORDER BY import_error_logs.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json({ success: true, errors });
  });

  // 获取最近的导入记录及错误统计
  app.get('/api/import-stats', async (req, res) => {
    const recentImports = await all(`
      SELECT 
        import_files.*,
        COUNT(import_error_logs.id) as error_count
      FROM import_files
      LEFT JOIN import_error_logs ON import_files.id = import_error_logs.import_file_id
      GROUP BY import_files.id
      ORDER BY import_files.imported_at DESC
      LIMIT 10
    `);
    res.json({ success: true, imports: recentImports });
  });

  // 获取单词列表（分页）- 优化版：直接包含关系数据
  app.get('/api/words', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * pageSize;

    let words;
    let total;

    if (search) {
      const searchTerm = `%${search}%`;
      words = await all('SELECT * FROM words WHERE english LIKE $1 OR chinese LIKE $2 ORDER BY english LIMIT $3 OFFSET $4', 
                  [searchTerm, searchTerm, pageSize, offset]);
      const totalResult = await get('SELECT COUNT(*) as total FROM words WHERE english LIKE $1 OR chinese LIKE $2', 
                  [searchTerm, searchTerm]);
      total = totalResult?.total || 0;
    } else {
      words = await all('SELECT * FROM words ORDER BY english LIMIT $1 OFFSET $2', [pageSize, offset]);
      const totalResult = await get('SELECT COUNT(*) as total FROM words');
      total = totalResult?.total || 0;
    }

    // 获取关系数据并构建树形结构
    const wordIds = words.map(w => w.id);
    let relations: any[] = [];
    let childWords: any[] = [];
    
    if (wordIds.length > 0) {
      const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
      relations = await all(`SELECT * FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
      
      const childWordIds = [...new Set(relations.map(r => r.child_word_id))];
      if (childWordIds.length > 0) {
        const childPlaceholders = childWordIds.map((_, i) => `$${i + 1}`).join(',');
        childWords = await all(`SELECT * FROM words WHERE id IN (${childPlaceholders})`, childWordIds);
      }
    }
    
    const wordMap = new Map();
    words.forEach(w => wordMap.set(w.id, { ...w, derivatives: [], phrases: [] }));
    childWords.forEach(w => wordMap.set(w.id, { ...w, derivatives: [], phrases: [] }));
    
    relations.forEach(r => {
      const child = wordMap.get(r.child_word_id);
      const parent = wordMap.get(r.root_word_id);
      if (child && parent) {
        if (r.relation_type === 'derivative') {
          parent.derivatives.push(child);
        } else {
          parent.phrases.push(child);
        }
      }
    });

    const result = words.map(word => {
      const wordData = wordMap.get(word.id);
      const children = [];
      
      if (wordData?.derivatives?.length > 0) {
        children.push({
          id: `deriv-${word.id}`,
          title: '衍生词',
          type: 'group',
          children: wordData.derivatives.map((d: any) => ({ ...d, isChild: true }))
        });
      }
      
      if (wordData?.phrases?.length > 0) {
        children.push({
          id: `phrase-${word.id}`,
          title: '短语',
          type: 'group',
          children: wordData.phrases.map((p: any) => ({ ...p, isChild: true }))
        });
      }
      
      return {
        ...word,
        hasChildren: children.length > 0,
        children,
        isChild: false
      };
    });

    // 获取所有子词ID
    const allChildWordIds = new Set((await all('SELECT child_word_id FROM word_relations')).map(r => r.child_word_id));
    
    const resultWithParentInfo = result.map(word => ({
      ...word,
      hasParent: allChildWordIds.has(word.id)
    }));

    res.json({
      words: resultWithParentInfo,
      total,
      page,
      pageSize
    });
  });

  // 更新单词
  app.put('/api/words/:id', async (req, res) => {
    const wordId = parseInt(req.params.id);
    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      await run('UPDATE words SET english = $1, part_of_speech = $2, chinese = $3 WHERE id = $4',
          [english, part_of_speech || '', chinese, wordId]);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Update word error:', error);
      res.status(500).json({ success: false, message: '更新失败' });
    }
  });

  // 获取单词的全局索引（按english排序）
  app.get('/api/words/index/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    
    try {
      const result = await get(`
        SELECT COUNT(*) as word_index 
        FROM words 
        WHERE english < (SELECT english FROM words WHERE id = $1)
        ORDER BY english
      `, [wordId]);
      
      const totalResult = await get('SELECT COUNT(*) as total FROM words');
      
      res.json({
        index: result?.word_index || 0,
        total: totalResult?.total || 0
      });
    } catch (error) {
      console.error('Get word index error:', error);
      res.status(500).json({ success: false, message: '获取索引失败' });
    }
  });

  // 添加新单词
  app.post('/api/words', async (req, res) => {
    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      await run('INSERT INTO words (english, part_of_speech, chinese, is_classified) VALUES ($1, $2, $3, 0)',
          [english, part_of_speech || '', chinese]);
      
      const newWord = await get('SELECT * FROM words ORDER BY id DESC LIMIT 1');
      
      res.json({ success: true, word: newWord });
    } catch (error) {
      console.error('Add word error:', error);
      res.status(500).json({ success: false, message: '添加失败' });
    }
  });

  // 删除单词
  app.delete('/api/words/:id', async (req, res) => {
    const wordId = parseInt(req.params.id);
    
    try {
      console.log(`[DeleteWord] Deleting word ${wordId}...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        // 先删除与该单词相关的所有关系
        await client.query('DELETE FROM word_relations WHERE root_word_id = $1 OR child_word_id = $1', [wordId]);
        // 从错题集和观察室删除
        await client.query('DELETE FROM error_words WHERE word_id = $1', [wordId]);
        await client.query('DELETE FROM observation_words WHERE word_id = $1', [wordId]);
        // 删除单词
        await client.query('DELETE FROM words WHERE id = $1', [wordId]);
        
        await client.query('COMMIT');
      });
      
      console.log('[DeleteWord] Complete');
      res.json({ success: true });
    } catch (error) {
      console.error('[DeleteWord] Error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // 批量删除单词
  app.post('/api/words/batch-delete', async (req, res) => {
    const { wordIds } = req.body;
    
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要删除的单词' });
    }
    
    try {
      console.log(`[BatchDelete] Deleting ${wordIds.length} words...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`DELETE FROM word_relations WHERE root_word_id IN (${placeholders}) OR child_word_id IN (${placeholders})`, [...wordIds, ...wordIds]);
        await client.query(`DELETE FROM error_words WHERE word_id IN (${placeholders})`, wordIds);
        await client.query(`DELETE FROM observation_words WHERE word_id IN (${placeholders})`, wordIds);
        await client.query(`DELETE FROM words WHERE id IN (${placeholders})`, wordIds);
        
        await client.query('COMMIT');
      });
      
      console.log('[BatchDelete] Complete');
      res.json({ success: true, deletedCount: wordIds.length });
    } catch (error) {
      console.error('[BatchDelete] Error:', error);
      res.status(500).json({ success: false, message: '批量删除失败' });
    }
  });

  // 添加到错题集
  app.post('/api/error-words', async (req, res) => {
    const { wordId } = req.body;
    // 检查是否已存在
    const existing = await get('SELECT * FROM error_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (word_id) VALUES ($1)', [wordId]);
    }
    res.json({ success: true });
  });

  // 从错题集移除并添加到观察室
  app.delete('/api/error-words/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM error_words WHERE word_id = $1', [wordId]);
    const existing = await get('SELECT * FROM observation_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO observation_words (word_id, correct_count) VALUES ($1, 0)', [wordId]);
    }
    res.json({ success: true });
  });

  // 获取错题集
  app.get('/api/error-words', async (req, res) => {
    const words = await all(`
      SELECT w.* FROM words w 
      JOIN error_words ew ON w.id = ew.word_id
    `);
    res.json({ words });
  });

  // 获取观察室单词
  app.get('/api/observation-words', async (req, res) => {
    const words = await all(`
      SELECT w.*, ow.correct_count FROM words w 
      JOIN observation_words ow ON w.id = ow.word_id
    `);
    res.json({ words });
  });

  // 观察室单词拼写正确
  app.post('/api/observation-words/:wordId/correct', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    const word = await get('SELECT * FROM observation_words WHERE word_id = $1', [wordId]);
    
    if (word) {
      const correctCount = parseInt(String(word.correct_count || '0'));
      const newCount = correctCount + 1;
      if (newCount >= 2) {
        await run('DELETE FROM observation_words WHERE word_id = $1', [wordId]);
      } else {
        await run('UPDATE observation_words SET correct_count = $1 WHERE word_id = $2', [newCount, wordId]);
      }
    }
    
    res.json({ success: true });
  });

  // 观察室单词拼写错误
  app.post('/api/observation-words/:wordId/error', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM observation_words WHERE word_id = $1', [wordId]);
    const existing = await get('SELECT * FROM error_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (word_id) VALUES ($1)', [wordId]);
    }
    res.json({ success: true });
  });

  // 获取昨日错词（上次练习的错词）
  app.get('/api/yesterday-errors', async (req, res) => {
    // 获取上一个已结束的练习会话
    const lastSession = await get('SELECT * FROM practice_sessions WHERE status = $1 ORDER BY id DESC LIMIT 1', ['completed']);
    
    if (!lastSession) {
      return res.json({ words: [], sessionId: null });
    }
    
    // 获取会话期间实际产生的错题（排除会话后手动添加的）
    const words = await all(`
      SELECT w.*, ew.error_date FROM words w
      JOIN error_words ew ON w.id = ew.word_id
      WHERE ew.error_date >= $1 AND ew.error_date <= $2
      AND ew.error_date <= $2
      ORDER BY ew.error_date DESC
    `, [lastSession.start_time, lastSession.end_time]);
    
    res.json({ words, sessionId: lastSession.id });
  });

  // 开始新的练习会话
  app.post('/api/practice/start', async (req, res) => {
    // 结束所有之前的活跃会话
    await run('UPDATE practice_sessions SET status = $1 WHERE status = $2', ['abandoned', 'active']);
    
    // 创建新会话
    await run('INSERT INTO practice_sessions (start_time, status) VALUES (NOW(), $1)', ['active']);
    const session = await get('SELECT * FROM practice_sessions ORDER BY id DESC LIMIT 1');
    
    res.json({ success: true, sessionId: session?.id });
  });

  // 结束练习会话
  app.post('/api/practice/end', async (req, res) => {
    const { sessionId } = req.body;
    
    if (sessionId) {
      await run('UPDATE practice_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['completed', sessionId]);
    } else {
      // 如果没有指定sessionId，结束所有活跃会话
      await run('UPDATE practice_sessions SET status = $1, end_time = NOW() WHERE status = $2', ['completed', 'active']);
    }
    
    res.json({ success: true });
  });

  // 保存/获取设置（如随手拼的进度）
  app.get('/api/settings/:key', async (req, res) => {
    const { key } = req.params;
    const setting = await get('SELECT value FROM settings WHERE key = $1', [key]);
    res.json({ value: setting?.value || null });
  });

  app.post('/api/settings/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    const existing = await get('SELECT * FROM settings WHERE key = $1', [key]);
    if (existing) {
      await run('UPDATE settings SET value = $1 WHERE key = $2', [value, key]);
    } else {
      await run('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
    }
    res.json({ success: true });
  });

  // 获取单词树形结构
  app.get('/api/words/batch-relations', async (req, res) => {
    const wordIds = (req.query.ids as string)?.split(',').map(id => parseInt(id)) || [];
    
    if (wordIds.length === 0) {
      return res.json({ relations: [], wordMap: {} });
    }

    const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
    
    const words = await all(`SELECT * FROM words WHERE id IN (${placeholders})`, wordIds);
    
    const childIdsResult = await all(`SELECT child_word_id FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    const childWordIds = childIdsResult.map(r => r.child_word_id);
    
    let childWords: any[] = [];
    if (childWordIds.length > 0) {
      const childPlaceholders = childWordIds.map((_, i) => `$${i + 1}`).join(',');
      childWords = await all(`SELECT * FROM words WHERE id IN (${childPlaceholders})`, childWordIds);
    }
    
    const allWordsData = [...words, ...childWords];
    const wordMap = new Map<number, any>();
    allWordsData.forEach(w => {
      wordMap.set(w.id, { ...w, derivatives: [], phrases: [] });
    });
    
    const relations = await all(`SELECT * FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    
    relations.forEach(rel => {
      const child = wordMap.get(rel.child_word_id);
      const parent = wordMap.get(rel.root_word_id);
      
      if (child && parent) {
        child.relationId = rel.id;
        child.relationType = rel.relation_type;
        child.parentId = rel.root_word_id;
        if (rel.relation_type === 'derivative') {
          parent.derivatives.push(child);
        } else {
          parent.phrases.push(child);
        }
      }
    });
    
    res.json({ relations, wordMap: Object.fromEntries(wordMap) });
  });

  app.get('/api/words/tree', async (req, res) => {
    const search = (req.query.search as string) || '';

    // 获取所有单词
    let allWords;
    if (search) {
      const searchTerm = `%${search}%`;
      allWords = await all('SELECT * FROM words WHERE english LIKE $1 OR chinese LIKE $2', [searchTerm, searchTerm]);
    } else {
      allWords = await all('SELECT * FROM words ORDER BY english');
    }

    // 获取所有关系
    const relations = await all('SELECT * FROM word_relations');

    // 获取分类规则
    const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

    // 构建树形结构
    const wordMap = new Map<number, any>();
    const rootWords: any[] = [];
    const childWordIds = new Set<number>();

    // 先创建所有单词节点
    allWords.forEach(word => {
      wordMap.set(word.id, {
        ...word,
        children: [],
        derivatives: [],
        phrases: []
      });
    });

    // 处理关系
    relations.forEach(rel => {
      const child = wordMap.get(rel.child_word_id);
      const parent = wordMap.get(rel.root_word_id);
      
      if (child && parent) {
        childWordIds.add(rel.child_word_id);
        child.relationId = rel.id;
        child.relationType = rel.relation_type;
        child.parentId = rel.root_word_id;
        if (rel.relation_type === 'derivative') {
          parent.derivatives.push(child);
        } else {
          parent.phrases.push(child);
        }
      }
    });

    // 找出根词（没有被任何关系引用的词）
    wordMap.forEach((word, id) => {
      if (!childWordIds.has(id)) {
        rootWords.push(word);
      }
    });

    // 合并子词到children数组（用于前端展示）
    rootWords.forEach(word => {
      const childItems: any[] = [];
      
      if (word.derivatives.length > 0) {
        const derivativeGroup = {
          id: `deriv-${word.id}`,
          title: '衍生词',
          type: 'group',
          children: word.derivatives.map((d: any) => ({
            ...d,
            children: [],
            relationType: 'derivative',
            relationId: d.relationId
          }))
        };
        childItems.push(derivativeGroup);
      }
      
      if (word.phrases.length > 0) {
        const phraseGroup = {
          id: `phrase-${word.id}`,
          title: '短语',
          type: 'group',
          children: word.phrases.map((p: any) => ({
            ...p,
            children: [],
            relationType: 'phrase',
            relationId: p.relationId
          }))
        };
        childItems.push(phraseGroup);
      }
      
      if (childItems.length > 0) {
        word.hasChildren = true;
        word.children = childItems;
      }
      delete word.derivatives;
      delete word.phrases;
    });

    res.json({ words: rootWords, allWordMap: Object.fromEntries(wordMap) });
  });

  // 获取单个单词的完整关系信息（包括作为根词的子词）
  app.get('/api/words/:id/relations', async (req, res) => {
    const wordId = parseInt(req.params.id);
    
    // 获取单词信息
    const word = await get('SELECT * FROM words WHERE id = $1', [wordId]);
    if (!word) {
      return res.status(404).json({ success: false, message: '单词不存在' });
    }

    // 获取所有关系
    const relations = await all('SELECT * FROM word_relations');
    const allWords = await all('SELECT * FROM words');
    
    const wordMap = new Map<number, any>();
    allWords.forEach(w => {
      wordMap.set(w.id, { ...w });
    });
    
    // 找到这个单词的子词
    const derivatives: any[] = [];
    const phrases: any[] = [];
    
    relations.forEach(rel => {
      if (rel.root_word_id === wordId) {
        const child = wordMap.get(rel.child_word_id);
        if (child) {
          const childWithRel = { ...child, relationId: rel.id, relationType: rel.relation_type };
          if (rel.relation_type === 'derivative') {
            derivatives.push(childWithRel);
          } else {
            phrases.push(childWithRel);
          }
        }
      }
    });
    
    // 构建children结构
    const children: any[] = [];
    if (derivatives.length > 0) {
      children.push({
        id: `deriv-${wordId}`,
        title: '衍生词',
        type: 'group',
        children: derivatives.map(d => ({ ...d, children: [] }))
      });
    }
    if (phrases.length > 0) {
      children.push({
        id: `phrase-${wordId}`,
        title: '短语',
        type: 'group',
        children: phrases.map(p => ({ ...p, children: [] }))
      });
    }

    res.json({
      ...word,
      hasChildren: children.length > 0,
      children
    });
  });

  // 添加单词关系
  app.post('/api/relations', async (req, res) => {
    const { rootWordId, childWordId, relationType } = req.body;
    
    // 检查是否已存在
    const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3', 
                        [rootWordId, childWordId, relationType]);
    
    if (existing) {
      return res.json({ success: false, message: '关系已存在' });
    }

    await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
        [rootWordId, childWordId, relationType]);

    res.json({ success: true });
  });

  // 删除单词关系
  app.delete('/api/relations/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    await run('DELETE FROM word_relations WHERE id = $1', [id]);
    res.json({ success: true });
  });

  // 删除某个单词的所有关系（设为独立词）
  app.delete('/api/relations/word/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM word_relations WHERE child_word_id = $1', [wordId]);
    res.json({ success: true });
  });

  // 重新分类所有单词
  app.post('/api/classify/all', async (req, res) => {
    const { keepManual = false, incremental = false } = req.body;

    try {
      console.log('[Classify] Starting classification...');

      // 如果不保留手动调整，先清空所有关系
      if (!keepManual) {
        console.log('[Classify] Clearing existing relations...');
        await run('DELETE FROM word_relations');
        await run('UPDATE words SET is_classified = 0');
      }

      // 获取需要分类的单词
      let words;
      if (incremental) {
        words = await all('SELECT * FROM words WHERE is_classified = 0');
      } else {
        words = await all('SELECT * FROM words');
      }
      
      if (words.length === 0) {
        console.log('[Classify] No words to classify');
        return res.json({ success: true, classified: 0 });
      }

      console.log(`[Classify] Classifying ${words.length} words...`);

      // 获取所有单词用于建立索引
      const allWords = await all('SELECT * FROM words');
      const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

      // 建立单词索引
      const wordIndex = new Map<string, number>();
      allWords.forEach(w => {
        wordIndex.set(w.english.toLowerCase(), w.id);
      });

      // 智能分类算法 - 收集所有需要插入的关系
      const relationsToInsert: Array<{ root: number; child: number; type: string }> = [];
      const processedIds: number[] = [];

      // 按单词长度排序，优先处理短单词作为词根
      const sortedAllWords = [...allWords].sort((a, b) => a.english.length - b.english.length);

      // 先获取所有现有关系，避免重复检查
      const existingRelations = await all('SELECT root_word_id, child_word_id, relation_type FROM word_relations');
      const existingRelSet = new Set(existingRelations.map(r => `${r.root_word_id}-${r.child_word_id}-${r.relation_type}`));

      for (const word of words) {
        const english = word.english.toLowerCase().trim();
        let wasClassified = false;
        
        // 判断是否是短语（包含空格）
        if (english.includes(' ')) {
          const coreWord = extractCoreWord(english, wordIndex);
          if (coreWord && coreWord !== word.id) {
            const key = `${coreWord}-${word.id}-phrase`;
            if (!existingRelSet.has(key)) {
              relationsToInsert.push({ root: coreWord, child: word.id, type: 'phrase' });
              wasClassified = true;
            }
          }
        } else {
          const rootWord = findBestRootWord(english, wordIndex, rules, sortedAllWords);
          if (rootWord && rootWord !== word.id) {
            const key = `${rootWord}-${word.id}-derivative`;
            if (!existingRelSet.has(key)) {
              relationsToInsert.push({ root: rootWord, child: word.id, type: 'derivative' });
              wasClassified = true;
            }
          }
        }

        if (wasClassified || (!incremental)) {
          processedIds.push(word.id);
        }
      }

      console.log(`[Classify] Inserting ${relationsToInsert.length} relations...`);

      // 批量插入关系
      if (relationsToInsert.length > 0) {
        const relationValues = relationsToInsert.map(r => [r.root, r.child, r.type]);
        await batchInsert('word_relations', ['root_word_id', 'child_word_id', 'relation_type'], relationValues);
      }

      // 批量标记已分类的单词
      if (processedIds.length > 0 && !incremental) {
        await batchUpdate('words', 'is_classified = 1', 'id', processedIds);
      }

      console.log('[Classify] Classification complete');
      res.json({ success: true, classified: relationsToInsert.length, total: words.length });
    } catch (error) {
      console.error('[Classify] Classification error:', error);
      res.status(500).json({ success: false, message: '分类失败' });
    }
  });
  
  // 重置单个单词的分类
  app.post('/api/classify/reset', async (req, res) => {
    const { wordId } = req.body;
    
    try {
      console.log(`[ResetClassify] Resetting word ${wordId}...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        // 首先解除该单词作为子单词的关系
        await client.query('DELETE FROM word_relations WHERE child_word_id = $1', [wordId]);
        // 解除该单词作为父单词的关系，并把这些子单词变回独立
        await client.query('DELETE FROM word_relations WHERE root_word_id = $1', [wordId]);
        // 标记该单词未分类
        await client.query('UPDATE words SET is_classified = 0 WHERE id = $1', [wordId]);
        
        await client.query('COMMIT');
      });
      
      console.log('[ResetClassify] Complete');
      res.json({ success: true });
    } catch (error) {
      console.error('[ResetClassify] Error:', error);
      res.status(500).json({ success: false, message: '重置分类失败' });
    }
  });

  // 获取所有根词（用于手动调整）
  app.get('/api/words/roots', async (req, res) => {
    // 获取所有没有作为子词出现的单词
    const childIdsResult = await all('SELECT DISTINCT child_word_id FROM word_relations');
    const childIds = childIdsResult.map(r => r.child_word_id);
    let roots;
    
    if (childIds.length > 0) {
      const placeholders = childIds.map((_, i) => `$${i + 1}`).join(',');
      roots = await all(`SELECT * FROM words WHERE id NOT IN (${placeholders}) ORDER BY english`, childIds);
    } else {
      roots = await all('SELECT * FROM words ORDER BY english');
    }
    
    res.json({ words: roots });
  });

  // 获取数据库状态
  app.get('/api/db/status', async (req, res) => {
    const totalResult = await get('SELECT COUNT(*) as count FROM words');
    res.json({
      success: true,
      totalWords: totalResult?.count || 0,
      isHuggingFace: process.env.HF_TOKEN ? true : false
    });
  });

  // 获取所有词性
  app.get('/api/parts-of-speech', async (req, res) => {
    const parts = await all('SELECT * FROM parts_of_speech ORDER BY code');
    res.json({ success: true, data: parts });
  });

  // 添加词性
  app.post('/api/parts-of-speech', async (req, res) => {
    const { code, name, description } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ success: false, message: '代码和名称不能为空' });
    }
    
    try {
      await run('INSERT INTO parts_of_speech (code, name, description, updated_at) VALUES ($1, $2, $3, NOW())',
          [code.trim(), name.trim(), description || '']);
      
      const newItem = await get('SELECT * FROM parts_of_speech ORDER BY id DESC LIMIT 1');
      res.json({ success: true, data: newItem });
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ success: false, message: '该代码已存在' });
      } else {
        console.error('Add part of speech error:', error);
        res.status(500).json({ success: false, message: '添加失败' });
      }
    }
  });

  // 更新词性
  app.put('/api/parts-of-speech/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { code, name, description } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ success: false, message: '代码和名称不能为空' });
    }
    
    try {
      await run('UPDATE parts_of_speech SET code = $1, name = $2, description = $3, updated_at = NOW() WHERE id = $4',
          [code.trim(), name.trim(), description || '', id]);
      
      const updatedItem = await get('SELECT * FROM parts_of_speech WHERE id = $1', [id]);
      res.json({ success: true, data: updatedItem });
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ success: false, message: '该代码已存在' });
      } else {
        console.error('Update part of speech error:', error);
        res.status(500).json({ success: false, message: '更新失败' });
      }
    }
  });

  // 删除词性
  app.delete('/api/parts-of-speech/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    try {
      await run('DELETE FROM parts_of_speech WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete part of speech error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // 从现有单词中初始化词性数据
  app.post('/api/parts-of-speech/init-from-words', async (req, res) => {
    try {
      console.log('[InitPOS] Starting initialization...');
      
      const existingCodesResult = await all('SELECT code FROM parts_of_speech');
      const existingCodes = new Set(existingCodesResult.map((p: any) => p.code.toLowerCase()));
      
      const posFromWordsResult = await all('SELECT DISTINCT part_of_speech FROM words WHERE part_of_speech IS NOT NULL AND part_of_speech != \'\'');
      
      const defaultPos = [
        { code: 'n.', name: '名词', description: '表示人、事、物、地点或抽象概念' },
        { code: 'v.', name: '动词', description: '表示动作、状态或发生的事情' },
        { code: 'adj.', name: '形容词', description: '描述或修饰名词' },
        { code: 'adv.', name: '副词', description: '修饰动词、形容词或其他副词' },
        { code: 'prep.', name: '介词', description: '表示时间、地点、方向等关系' },
        { code: 'conj.', name: '连词', description: '连接单词、短语或句子' },
        { code: 'pron.', name: '代词', description: '代替名词或名词短语' },
        { code: 'num.', name: '数词', description: '表示数量或顺序' },
        { code: 'art.', name: '冠词', description: '限定名词' },
        { code: 'interj.', name: '感叹词', description: '表达强烈情感' },
        { code: 'suff.', name: '后缀', description: '单词后缀' },
        { code: 'comb.', name: '组合形式', description: '用于构成复合词' },
        { code: 'abbr.', name: '缩写', description: '缩写形式' },
        { code: 'pl.', name: '复数', description: '复数形式' },
        { code: 'sing.', name: '单数', description: '单数形式' },
      ];
      
      const toInsert: Array<[string, string, string]> = [];
      
      for (const pos of defaultPos) {
        if (!existingCodes.has(pos.code.toLowerCase())) {
          toInsert.push([pos.code, pos.name, pos.description]);
          existingCodes.add(pos.code.toLowerCase());
        }
      }
      
      for (const item of posFromWordsResult) {
        const code = item.part_of_speech.trim();
        if (code && !existingCodes.has(code.toLowerCase())) {
          toInsert.push([code, code, '从导入数据中提取']);
          existingCodes.add(code.toLowerCase());
        }
      }
      
      if (toInsert.length > 0) {
        console.log(`[InitPOS] Inserting ${toInsert.length} POS entries...`);
        
        await batchInsert('parts_of_speech', ['code', 'name', 'description'], toInsert);
      }
      
      console.log(`[InitPOS] Complete, added ${toInsert.length} entries`);
      res.json({ success: true, addedCount: toInsert.length });
    } catch (error) {
      console.error('[InitPOS] Error:', error);
      res.status(500).json({ success: false, message: '初始化失败' });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// 从短语中提取核心词
function extractCoreWord(phrase: string, wordIndex: Map<string, number>): number | null {
  const parts = phrase.split(' ');
  
  // 尝试第一个词
  if (wordIndex.has(parts[0])) {
    return wordIndex.get(parts[0]) || null;
  }
  
  // 尝试去除常见介词后的第一个词
  const prepositions = ['to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'of', 'up', 'out', 'into', 'over', 'under'];
  for (let i = 0; i < parts.length; i++) {
    if (!prepositions.includes(parts[i])) {
      if (wordIndex.has(parts[i])) {
        return wordIndex.get(parts[i]) || null;
      }
    }
  }
  
  return null;
}

// 查找根词
function findRootWord(word: string, wordIndex: Map<string, number>, rules: any[]): number | null {
  return findBestRootWord(word, wordIndex, rules, []);
}

// 查找最佳根词 - 更精确的算法
function findBestRootWord(word: string, wordIndex: Map<string, number>, rules: any[], allWords: any[]): number | null {
  let bestRoot: number | null = null;
  let bestRootLength = -1;
  
  // 首先尝试直接找最可能的短词根
  for (const rule of rules) {
    const suffix = rule.suffix;
    
    if (word.endsWith(suffix)) {
      let root = word.slice(0, -suffix.length);
      
      // 处理特殊情况：如果后缀是 'tion'，可能需要去掉前面的 'a' 或 'i'
      if (suffix === 'tion' || suffix === 'ation') {
        if (root.endsWith('a') || root.endsWith('i')) {
          const altRoot = root.slice(0, -1);
          if (wordIndex.has(altRoot)) {
            if (altRoot.length > bestRootLength) {
              bestRoot = wordIndex.get(altRoot) || null;
              bestRootLength = altRoot.length;
            }
          }
        }
      }
      
      // 尝试当前词根
      if (wordIndex.has(root)) {
        if (root.length > bestRootLength) {
          bestRoot = wordIndex.get(root) || null;
          bestRootLength = root.length;
        }
      }
      
      // 尝试去掉末尾的e（如translate -> translation）
      if (root.endsWith('e') && wordIndex.has(root.slice(0, -1))) {
        const altRoot = root.slice(0, -1);
        if (altRoot.length > bestRootLength) {
          bestRoot = wordIndex.get(altRoot) || null;
          bestRootLength = altRoot.length;
        }
      }
    }
    
    // 尝试前缀
    if (word.startsWith(suffix)) {
      const root = word.slice(suffix.length);
      if (wordIndex.has(root)) {
        if (root.length > bestRootLength) {
          bestRoot = wordIndex.get(root) || null;
          bestRootLength = root.length;
        }
      }
    }
  }
  
  return bestRoot;
}

startServer();
