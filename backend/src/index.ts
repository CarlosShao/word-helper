import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb, run, all, get, batchRun, saveDb } from './db';
import { parsePdf } from './pdfParser';

const app = express();
const PORT = process.env.PORT || 3000;

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
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const parseResult = await parsePdf(filePath);
      const { words, errors } = parseResult;

      // 先插入导入文件记录，获取ID
      run('INSERT INTO import_files (filename) VALUES (?)', [req.file.originalname]);
      const importFileResult = get('SELECT last_insert_rowid() as id');
      const importFileId = importFileResult?.id || 0;

      // 保存错误日志
      for (const error of errors) {
        run('INSERT INTO import_error_logs (import_file_id, index_number, english, reason) VALUES (?, ?, ?, ?)',
            [importFileId, error.index, error.english, error.reason]);
      }

      // 清空现有单词
      run('DELETE FROM word_relations');
      run('DELETE FROM words');
      
      // 逐个插入单词（逐个插入更可靠）
      for (const word of words) {
        run('INSERT INTO words (english, part_of_speech, chinese, is_classified) VALUES (?, ?, ?, 0)',
            [word.english, word.part_of_speech, word.chinese]);
      }
      
      saveDb();

      // 后台触发自动分类
      setTimeout(() => {
        try {
          const allWords = all('SELECT * FROM words');
          const rules = all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');
          
          const wordIndex = new Map<string, number>();
          allWords.forEach(w => {
            wordIndex.set(w.english.toLowerCase(), w.id);
          });

          const processedIds: number[] = [];
          for (const word of allWords) {
            const english = word.english.toLowerCase().trim();
            let wasClassified = false;
            
            if (english.includes(' ')) {
              const coreWord = extractCoreWord(english, wordIndex);
              if (coreWord && coreWord !== word.id) {
                const existing = get('SELECT * FROM word_relations WHERE root_word_id = ? AND child_word_id = ? AND relation_type = ?',
                                  [coreWord, word.id, 'phrase']);
                if (!existing) {
                  run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES (?, ?, ?)',
                      [coreWord, word.id, 'phrase']);
                  wasClassified = true;
                }
              }
            } else {
              const rootWord = findRootWord(english, wordIndex, rules);
              if (rootWord && rootWord !== word.id) {
                const existing = get('SELECT * FROM word_relations WHERE root_word_id = ? AND child_word_id = ? AND relation_type = ?',
                                  [rootWord, word.id, 'derivative']);
                if (!existing) {
                  run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES (?, ?, ?)',
                      [rootWord, word.id, 'derivative']);
                  wasClassified = true;
                }
              }
            }
            
            if (wasClassified) {
              processedIds.push(word.id);
            }
          }
          
          if (processedIds.length > 0) {
            const placeholders = processedIds.map(() => '?').join(',');
            run(`UPDATE words SET is_classified = 1 WHERE id IN (${placeholders})`, processedIds);
          }
          
          saveDb();
        } catch (e) {
          console.error('Auto classification failed:', e);
        }
      }, 500);

      res.json({ success: true, count: words.length, errorCount: errors.length, errors });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ error: 'Failed to import file' });
    }
  });

  // 获取导入错误日志
  app.get('/api/import-errors', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const errors = all(`
      SELECT 
        import_error_logs.*,
        import_files.filename,
        import_files.imported_at
      FROM import_error_logs 
      LEFT JOIN import_files ON import_error_logs.import_file_id = import_files.id
      ORDER BY import_error_logs.created_at DESC
      LIMIT ?
    `, [limit]);
    res.json({ success: true, errors });
  });

  // 获取最近的导入记录及错误统计
  app.get('/api/import-stats', (req, res) => {
    const recentImports = all(`
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
  app.get('/api/words', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * pageSize;

    let words;
    let total;

    if (search) {
      const searchTerm = `%${search}%`;
      words = all('SELECT * FROM words WHERE english LIKE ? OR chinese LIKE ? ORDER BY english LIMIT ? OFFSET ?', 
                  [searchTerm, searchTerm, pageSize, offset]);
      total = get('SELECT COUNT(*) as total FROM words WHERE english LIKE ? OR chinese LIKE ?', 
                  [searchTerm, searchTerm])?.total || 0;
    } else {
      words = all('SELECT * FROM words ORDER BY english LIMIT ? OFFSET ?', [pageSize, offset]);
      total = get('SELECT COUNT(*) as total FROM words')?.total || 0;
    }

    // 获取关系数据并构建树形结构
    const wordIds = words.map(w => w.id);
    const relations = all('SELECT * FROM word_relations WHERE root_word_id IN (' + wordIds.map(() => '?').join(',') + ')', wordIds);
    const childWordIds = [...new Set(relations.map(r => r.child_word_id))];
    let childWords = [];
    if (childWordIds.length > 0) {
      childWords = all('SELECT * FROM words WHERE id IN (' + childWordIds.map(() => '?').join(',') + ')', childWordIds);
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
    const allChildWordIds = new Set(all('SELECT child_word_id FROM word_relations').map(r => r.child_word_id));
    
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
  app.put('/api/words/:id', (req, res) => {
    const wordId = parseInt(req.params.id);
    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      run('UPDATE words SET english = ?, part_of_speech = ?, chinese = ? WHERE id = ?',
          [english, part_of_speech || '', chinese, wordId]);
      saveDb();
      
      res.json({ success: true });
    } catch (error) {
      console.error('Update word error:', error);
      res.status(500).json({ success: false, message: '更新失败' });
    }
  });

  // 获取单词的全局索引（按english排序）
  app.get('/api/words/index/:wordId', (req, res) => {
    const wordId = parseInt(req.params.wordId);
    
    try {
      const result = get(`
        SELECT COUNT(*) as word_index 
        FROM words 
        WHERE english < (SELECT english FROM words WHERE id = ?)
        ORDER BY english
      `, [wordId]);
      
      const total = get('SELECT COUNT(*) as total FROM words');
      
      res.json({
        index: result?.word_index || 0,
        total: total?.total || 0
      });
    } catch (error) {
      console.error('Get word index error:', error);
      res.status(500).json({ success: false, message: '获取索引失败' });
    }
  });

  // 添加新单词
  app.post('/api/words', (req, res) => {
    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      run('INSERT INTO words (english, part_of_speech, chinese, is_classified) VALUES (?, ?, ?, 0)',
          [english, part_of_speech || '', chinese]);
      saveDb();
      
      const newWord = get('SELECT * FROM words ORDER BY id DESC LIMIT 1');
      
      res.json({ success: true, word: newWord });
    } catch (error) {
      console.error('Add word error:', error);
      res.status(500).json({ success: false, message: '添加失败' });
    }
  });

  // 删除单词
  app.delete('/api/words/:id', (req, res) => {
    const wordId = parseInt(req.params.id);
    
    try {
      // 先删除与该单词相关的所有关系
      run('DELETE FROM word_relations WHERE root_word_id = ? OR child_word_id = ?', [wordId, wordId]);
      // 从错题集和观察室删除
      run('DELETE FROM error_words WHERE word_id = ?', [wordId]);
      run('DELETE FROM observation_words WHERE word_id = ?', [wordId]);
      // 删除单词
      run('DELETE FROM words WHERE id = ?', [wordId]);
      saveDb();
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete word error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // 批量删除单词
  app.post('/api/words/batch-delete', (req, res) => {
    const { wordIds } = req.body;
    
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要删除的单词' });
    }
    
    try {
      const placeholders = wordIds.map(() => '?').join(',');
      run(`DELETE FROM word_relations WHERE root_word_id IN (${placeholders}) OR child_word_id IN (${placeholders})`, [...wordIds, ...wordIds]);
      run(`DELETE FROM error_words WHERE word_id IN (${placeholders})`, wordIds);
      run(`DELETE FROM observation_words WHERE word_id IN (${placeholders})`, wordIds);
      run(`DELETE FROM words WHERE id IN (${placeholders})`, wordIds);
      saveDb();
      
      res.json({ success: true, deletedCount: wordIds.length });
    } catch (error) {
      console.error('Batch delete error:', error);
      res.status(500).json({ success: false, message: '批量删除失败' });
    }
  });

  // 添加到错题集
  app.post('/api/error-words', (req, res) => {
    const { wordId } = req.body;
    // 检查是否已存在
    const existing = get('SELECT * FROM error_words WHERE word_id = ?', [wordId]);
    if (!existing) {
      run('INSERT INTO error_words (word_id) VALUES (?)', [wordId]);
    }
    res.json({ success: true });
  });

  // 从错题集移除并添加到观察室
  app.delete('/api/error-words/:wordId', (req, res) => {
    const wordId = parseInt(req.params.wordId);
    run('DELETE FROM error_words WHERE word_id = ?', [wordId]);
    const existing = get('SELECT * FROM observation_words WHERE word_id = ?', [wordId]);
    if (!existing) {
      run('INSERT INTO observation_words (word_id, correct_count) VALUES (?, 0)', [wordId]);
    }
    res.json({ success: true });
  });

  // 获取错题集
  app.get('/api/error-words', (req, res) => {
    const words = all(`
      SELECT w.* FROM words w 
      JOIN error_words ew ON w.id = ew.word_id
    `);
    res.json({ words });
  });

  // 获取观察室单词
  app.get('/api/observation-words', (req, res) => {
    const words = all(`
      SELECT w.*, ow.correct_count FROM words w 
      JOIN observation_words ow ON w.id = ow.word_id
    `);
    res.json({ words });
  });

  // 观察室单词拼写正确
  app.post('/api/observation-words/:wordId/correct', (req, res) => {
    const wordId = parseInt(req.params.wordId);
    const word = get('SELECT * FROM observation_words WHERE word_id = ?', [wordId]);
    
    if (word) {
      const correctCount = parseInt(String(word.correct_count || '0'));
      const newCount = correctCount + 1;
      if (newCount >= 2) {
        run('DELETE FROM observation_words WHERE word_id = ?', [wordId]);
      } else {
        run('UPDATE observation_words SET correct_count = ? WHERE word_id = ?', [newCount, wordId]);
      }
    }
    
    res.json({ success: true });
  });

  // 观察室单词拼写错误
  app.post('/api/observation-words/:wordId/error', (req, res) => {
    const wordId = parseInt(req.params.wordId);
    run('DELETE FROM observation_words WHERE word_id = ?', [wordId]);
    const existing = get('SELECT * FROM error_words WHERE word_id = ?', [wordId]);
    if (!existing) {
      run('INSERT INTO error_words (word_id) VALUES (?)', [wordId]);
    }
    res.json({ success: true });
  });

  // 获取昨日错词（上次练习的错词）
  app.get('/api/yesterday-errors', (req, res) => {
    // 获取上一个已结束的练习会话
    const lastSession = get('SELECT * FROM practice_sessions WHERE status = ? ORDER BY id DESC LIMIT 1', ['completed']);
    
    if (!lastSession) {
      return res.json({ words: [], sessionId: null });
    }
    
    // 获取会话期间实际产生的错题（排除会话后手动添加的）
    const words = all(`
      SELECT w.*, ew.error_date FROM words w
      JOIN error_words ew ON w.id = ew.word_id
      WHERE ew.error_date >= ? AND ew.error_date <= ?
      AND ew.error_date <= ?
      ORDER BY ew.error_date DESC
    `, [lastSession.start_time, lastSession.end_time, lastSession.end_time]);
    
    res.json({ words, sessionId: lastSession.id });
  });

  // 开始新的练习会话
  app.post('/api/practice/start', (req, res) => {
    // 结束所有之前的活跃会话
    run('UPDATE practice_sessions SET status = ? WHERE status = ?', ['abandoned', 'active']);
    
    // 创建新会话
    const result = run('INSERT INTO practice_sessions (start_time, status) VALUES (datetime("now"), ?)', ['active']);
    const session = get('SELECT * FROM practice_sessions ORDER BY id DESC LIMIT 1');
    
    res.json({ success: true, sessionId: session?.id });
  });

  // 结束练习会话
  app.post('/api/practice/end', (req, res) => {
    const { sessionId } = req.body;
    
    if (sessionId) {
      run('UPDATE practice_sessions SET status = ?, end_time = datetime("now") WHERE id = ?', ['completed', sessionId]);
    } else {
      // 如果没有指定sessionId，结束所有活跃会话
      run('UPDATE practice_sessions SET status = ?, end_time = datetime("now") WHERE status = ?', ['completed', 'active']);
    }
    
    res.json({ success: true });
  });

  // 保存/获取设置（如随手拼的进度）
  app.get('/api/settings/:key', (req, res) => {
    const { key } = req.params;
    const setting = get('SELECT value FROM settings WHERE key = ?', [key]);
    res.json({ value: setting?.value || null });
  });

  app.post('/api/settings/:key', (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    const existing = get('SELECT * FROM settings WHERE key = ?', [key]);
    if (existing) {
      run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    } else {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    res.json({ success: true });
  });

  // 获取单词树形结构
  app.get('/api/words/batch-relations', (req, res) => {
    const wordIds = (req.query.ids as string)?.split(',').map(id => parseInt(id)) || [];
    
    if (wordIds.length === 0) {
      return res.json({ relations: [], wordMap: {} });
    }

    const placeholders = wordIds.map(() => '?').join(',');
    
    const words = all(`SELECT * FROM words WHERE id IN (${placeholders})`, wordIds);
    
    const childIds = all(`SELECT child_word_id FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    const childWordIds = childIds.map(r => r.child_word_id);
    
    let childWords = [];
    if (childWordIds.length > 0) {
      const childPlaceholders = childWordIds.map(() => '?').join(',');
      childWords = all(`SELECT * FROM words WHERE id IN (${childPlaceholders})`, childWordIds);
    }
    
    const allWordsData = [...words, ...childWords];
    const wordMap = new Map<number, any>();
    allWordsData.forEach(w => {
      wordMap.set(w.id, { ...w, derivatives: [], phrases: [] });
    });
    
    const relations = all(`SELECT * FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    
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

  app.get('/api/words/tree', (req, res) => {
    const search = (req.query.search as string) || '';

    // 获取所有单词
    let allWords;
    if (search) {
      const searchTerm = `%${search}%`;
      allWords = all('SELECT * FROM words WHERE english LIKE ? OR chinese LIKE ?', [searchTerm, searchTerm]);
    } else {
      allWords = all('SELECT * FROM words ORDER BY english');
    }

    // 获取所有关系
    const relations = all('SELECT * FROM word_relations');

    // 获取分类规则
    const rules = all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

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
  app.get('/api/words/:id/relations', (req, res) => {
    const wordId = parseInt(req.params.id);
    
    // 获取单词信息
    const word = get('SELECT * FROM words WHERE id = ?', [wordId]);
    if (!word) {
      return res.status(404).json({ success: false, message: '单词不存在' });
    }

    // 获取所有关系
    const relations = all('SELECT * FROM word_relations');
    const allWords = all('SELECT * FROM words');
    
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
  app.post('/api/relations', (req, res) => {
    const { rootWordId, childWordId, relationType } = req.body;
    
    // 检查是否已存在
    const existing = get('SELECT * FROM word_relations WHERE root_word_id = ? AND child_word_id = ? AND relation_type = ?', 
                        [rootWordId, childWordId, relationType]);
    
    if (existing) {
      return res.json({ success: false, message: '关系已存在' });
    }

    run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES (?, ?, ?)',
        [rootWordId, childWordId, relationType]);
    saveDb();

    res.json({ success: true });
  });

  // 删除单词关系
  app.delete('/api/relations/:id', (req, res) => {
    const id = parseInt(req.params.id);
    run('DELETE FROM word_relations WHERE id = ?', [id]);
    saveDb();
    res.json({ success: true });
  });

  // 删除某个单词的所有关系（设为独立词）
  app.delete('/api/relations/word/:wordId', (req, res) => {
    const wordId = parseInt(req.params.wordId);
    run('DELETE FROM word_relations WHERE child_word_id = ?', [wordId]);
    saveDb();
    res.json({ success: true });
  });

  // 重新分类所有单词
  app.post('/api/classify/all', (req, res) => {
    const { keepManual = false, incremental = false } = req.body;

    try {
      // 如果不保留手动调整，先清空所有关系
      if (!keepManual) {
        run('DELETE FROM word_relations');
        run('UPDATE words SET is_classified = 0');
      }

      // 获取需要分类的单词
      let words;
      if (incremental) {
        words = all('SELECT * FROM words WHERE is_classified = 0');
      } else {
        words = all('SELECT * FROM words');
      }
      
      if (words.length === 0) {
        return res.json({ success: true, classified: 0 });
      }

      // 获取所有单词用于建立索引
      const allWords = all('SELECT * FROM words');
      const rules = all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

      // 建立单词索引
      const wordIndex = new Map<string, number>();
      allWords.forEach(w => {
        wordIndex.set(w.english.toLowerCase(), w.id);
      });

      // 智能分类算法 - 更精确的算法
      let classifiedCount = 0;
      const processedIds: number[] = [];

      // 先找出所有可能的词根，避免长单词被短单词错误匹配
      // 按单词长度排序，优先处理短单词作为词根
      const sortedAllWords = [...allWords].sort((a, b) => a.english.length - b.english.length);

      for (const word of words) {
        const english = word.english.toLowerCase().trim();
        let wasClassified = false;
        
        // 判断是否是短语（包含空格）
        if (english.includes(' ')) {
          const coreWord = extractCoreWord(english, wordIndex);
          if (coreWord && coreWord !== word.id) {
            const existing = get('SELECT * FROM word_relations WHERE root_word_id = ? AND child_word_id = ? AND relation_type = ?',
                              [coreWord, word.id, 'phrase']);
            if (!existing) {
              run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES (?, ?, ?)',
                  [coreWord, word.id, 'phrase']);
              wasClassified = true;
              classifiedCount++;
            }
          }
        } else {
          const rootWord = findBestRootWord(english, wordIndex, rules, sortedAllWords);
          if (rootWord && rootWord !== word.id) {
            const existing = get('SELECT * FROM word_relations WHERE root_word_id = ? AND child_word_id = ? AND relation_type = ?',
                              [rootWord, word.id, 'derivative']);
            if (!existing) {
              run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES (?, ?, ?)',
                  [rootWord, word.id, 'derivative']);
              wasClassified = true;
              classifiedCount++;
            }
          }
        }

        processedIds.push(word.id);
      }

      // 标记已分类的单词
      if (processedIds.length > 0) {
        const placeholders = processedIds.map(() => '?').join(',');
        run(`UPDATE words SET is_classified = 1 WHERE id IN (${placeholders})`, processedIds);
      }

      saveDb();
      res.json({ success: true, classified: classifiedCount, total: words.length });
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({ success: false, message: '分类失败' });
    }
  });
  
  // 重置单个单词的分类
  app.post('/api/classify/reset', (req, res) => {
    const { wordId } = req.body;
    
    try {
      // 首先解除该单词作为子单词的关系
      run('DELETE FROM word_relations WHERE child_word_id = ?', [wordId]);
      // 解除该单词作为父单词的关系，并把这些子单词变回独立
      run('DELETE FROM word_relations WHERE root_word_id = ?', [wordId]);
      // 标记该单词未分类
      run('UPDATE words SET is_classified = 0 WHERE id = ?', [wordId]);
      
      saveDb();
      res.json({ success: true });
    } catch (error) {
      console.error('Reset classification error:', error);
      res.status(500).json({ success: false, message: '重置分类失败' });
    }
  });

  // 获取所有根词（用于手动调整）
  app.get('/api/words/roots', (req, res) => {
    // 获取所有没有作为子词出现的单词
    const childIds = all('SELECT DISTINCT child_word_id FROM word_relations').map(r => r.child_word_id);
    let roots;
    
    if (childIds.length > 0) {
      roots = all(`SELECT * FROM words WHERE id NOT IN (${childIds.join(',')}) ORDER BY english`);
    } else {
      roots = all('SELECT * FROM words ORDER BY english');
    }
    
    res.json({ words: roots });
  });

  // 手动保存数据库（现在使用 Persistent Storage，数据会自动持久化）
  app.post('/api/db/save', async (req, res) => {
    try {
      saveDb();
      res.json({ success: true, message: '数据库已保存到 Persistent Storage' });
    } catch (error) {
      console.error('Save error:', error);
      res.status(500).json({ success: false, message: '保存失败' });
    }
  });

  // 获取数据库状态
  app.get('/api/db/status', (req, res) => {
    const totalWords = get('SELECT COUNT(*) as count FROM words')?.count || 0;
    res.json({
      success: true,
      totalWords,
      isHuggingFace: process.env.HF_TOKEN ? true : false
    });
  });

  // 执行数据库迁移
  migrateDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// 数据库迁移：为现有数据库添加 is_classified 字段
function migrateDb() {
  try {
    const columns = all("PRAGMA table_info(words)");
    const hasIsClassified = columns.some((col: any) => col.name === 'is_classified');
    if (!hasIsClassified) {
      run('ALTER TABLE words ADD COLUMN is_classified INTEGER DEFAULT 0');
      saveDb();
      console.log('Database migrated: added is_classified column');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
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

// 获取所有词性
app.get('/api/parts-of-speech', (req, res) => {
  const parts = all('SELECT * FROM parts_of_speech ORDER BY code');
  res.json({ success: true, data: parts });
});

// 添加词性
app.post('/api/parts-of-speech', (req, res) => {
  const { code, name, description } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ success: false, message: '代码和名称不能为空' });
  }
  
  try {
    run('INSERT INTO parts_of_speech (code, name, description, updated_at) VALUES (?, ?, ?, datetime("now"))',
        [code.trim(), name.trim(), description || '']);
    saveDb();
    
    const newItem = get('SELECT * FROM parts_of_speech ORDER BY id DESC LIMIT 1');
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
app.put('/api/parts-of-speech/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { code, name, description } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ success: false, message: '代码和名称不能为空' });
  }
  
  try {
    run('UPDATE parts_of_speech SET code = ?, name = ?, description = ?, updated_at = datetime("now") WHERE id = ?',
        [code.trim(), name.trim(), description || '', id]);
    saveDb();
    
    const updatedItem = get('SELECT * FROM parts_of_speech WHERE id = ?', [id]);
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
app.delete('/api/parts-of-speech/:id', (req, res) => {
  const id = parseInt(req.params.id);
  
  try {
    run('DELETE FROM parts_of_speech WHERE id = ?', [id]);
    saveDb();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete part of speech error:', error);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// 从现有单词中初始化词性数据
app.post('/api/parts-of-speech/init-from-words', (req, res) => {
  try {
    const existingCodes = all('SELECT code FROM parts_of_speech').map((p: any) => p.code.toLowerCase());
    
    const posFromWords = all('SELECT DISTINCT part_of_speech FROM words WHERE part_of_speech IS NOT NULL AND part_of_speech != ""');
    
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
    
    let addedCount = 0;
    
    defaultPos.forEach(pos => {
      if (!existingCodes.includes(pos.code.toLowerCase())) {
        run('INSERT INTO parts_of_speech (code, name, description, updated_at) VALUES (?, ?, ?, datetime("now"))',
            [pos.code, pos.name, pos.description]);
        addedCount++;
        existingCodes.push(pos.code.toLowerCase());
      }
    });
    
    posFromWords.forEach((item: any) => {
      const code = item.part_of_speech.trim();
      if (code && !existingCodes.includes(code.toLowerCase())) {
        run('INSERT INTO parts_of_speech (code, name, description, updated_at) VALUES (?, ?, ?, datetime("now"))',
            [code, code, '从导入数据中提取']);
        addedCount++;
        existingCodes.push(code.toLowerCase());
      }
    });
    
    saveDb();
    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('Init parts of speech error:', error);
    res.status(500).json({ success: false, message: '初始化失败' });
  }
});

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
