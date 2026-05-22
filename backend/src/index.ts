// 强制 Node.js 优先使用 IPv4
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createPool, initDb, run, all, get, batchRun, saveDb } from './db';
import { parsePdf } from './pdfParser';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

async function startServer() {
  await createPool();
  await initDb();

  const staticDir = path.join(__dirname, '../public');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });

  const upload = multer({ storage });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'carlos' && password === 'swq') {
      const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      res.json({ success: true, token, username });
    } else {
      res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
  });

  app.post('/api/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const parseResult = await parsePdf(filePath);
      const { words, errors } = parseResult;

      await run('INSERT INTO import_files (filename) VALUES ($1)', [req.file.originalname]);
      
      const importFileResult = await get('SELECT currval(pg_get_serial_sequence(\'import_files\', \'id\')) as id');
      const importFileId = importFileResult?.id || 0;

      for (const error of errors) {
        await run('INSERT INTO import_error_logs (import_file_id, index_number, english, reason) VALUES ($1, $2, $3, $4)',
            [importFileId, error.index, error.english, error.reason]);
      }

      await run('DELETE FROM word_relations');
      await run('DELETE FROM words');
      
      for (const word of words) {
        await run('INSERT INTO words (english, part_of_speech, chinese, is_classified) VALUES ($1, $2, $3, 0)',
            [word.english, word.part_of_speech, word.chinese]);
      }

      setTimeout(async () => {
        try {
          const allWords = await all('SELECT * FROM words');
          const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');
          
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
                const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                                  [coreWord, word.id, 'phrase']);
                if (!existing) {
                  await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
                      [coreWord, word.id, 'phrase']);
                  wasClassified = true;
                }
              }
            } else {
              const rootWord = findRootWord(english, wordIndex, rules);
              if (rootWord && rootWord !== word.id) {
                const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                                  [rootWord, word.id, 'derivative']);
                if (!existing) {
                  await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
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
            const placeholders = processedIds.map((_, i) => `$${i + 1}`).join(',');
            await run(`UPDATE words SET is_classified = 1 WHERE id IN (${placeholders})`, processedIds);
          }
          
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
      total = await get('SELECT COUNT(*) as total FROM words WHERE english LIKE $1 OR chinese LIKE $2', 
                  [searchTerm, searchTerm]);
      total = total?.total || 0;
    } else {
      words = await all('SELECT * FROM words ORDER BY english LIMIT $1 OFFSET $2', [pageSize, offset]);
      total = await get('SELECT COUNT(*) as total FROM words');
      total = total?.total || 0;
    }

    const wordIds = words.map(w => w.id);
    const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
    const relations = await all(`SELECT * FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    const childWordIds = [...new Set(relations.map(r => r.child_word_id))];
    let childWords = [];
    if (childWordIds.length > 0) {
      const childPlaceholders = childWordIds.map((_, i) => `$${i + 1}`).join(',');
      childWords = await all(`SELECT * FROM words WHERE id IN (${childPlaceholders})`, childWordIds);
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

    const allChildWordIdsResult = await all('SELECT child_word_id FROM word_relations');
    const allChildWordIds = new Set(allChildWordIdsResult.map(r => r.child_word_id));
    
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

  app.get('/api/words/index/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    
    try {
      const result = await get(`
        SELECT COUNT(*) as word_index 
        FROM words 
        WHERE english < (SELECT english FROM words WHERE id = $1)
      `, [wordId]);
      
      const total = await get('SELECT COUNT(*) as total FROM words');
      
      res.json({
        index: result?.word_index || 0,
        total: total?.total || 0
      });
    } catch (error) {
      console.error('Get word index error:', error);
      res.status(500).json({ success: false, message: '获取索引失败' });
    }
  });

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

  app.delete('/api/words/:id', async (req, res) => {
    const wordId = parseInt(req.params.id);
    
    try {
      await run('DELETE FROM word_relations WHERE root_word_id = $1 OR child_word_id = $1', [wordId]);
      await run('DELETE FROM error_words WHERE word_id = $1', [wordId]);
      await run('DELETE FROM observation_words WHERE word_id = $1', [wordId]);
      await run('DELETE FROM words WHERE id = $1', [wordId]);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete word error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  app.post('/api/words/batch-delete', async (req, res) => {
    const { wordIds } = req.body;
    
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要删除的单词' });
    }
    
    try {
      const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
      const doublePlaceholders = [...wordIds, ...wordIds].map((_, i) => `$${i + 1}`).join(',');
      
      await run(`DELETE FROM word_relations WHERE root_word_id IN (${placeholders}) OR child_word_id IN (${placeholders})`, [...wordIds, ...wordIds]);
      await run(`DELETE FROM error_words WHERE word_id IN (${placeholders})`, wordIds);
      await run(`DELETE FROM observation_words WHERE word_id IN (${placeholders})`, wordIds);
      await run(`DELETE FROM words WHERE id IN (${placeholders})`, wordIds);
      
      res.json({ success: true, deletedCount: wordIds.length });
    } catch (error) {
      console.error('Batch delete error:', error);
      res.status(500).json({ success: false, message: '批量删除失败' });
    }
  });

  app.post('/api/error-words', async (req, res) => {
    const { wordId } = req.body;
    const existing = await get('SELECT * FROM error_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (word_id) VALUES ($1)', [wordId]);
    }
    res.json({ success: true });
  });

  app.delete('/api/error-words/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM error_words WHERE word_id = $1', [wordId]);
    const existing = await get('SELECT * FROM observation_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO observation_words (word_id, correct_count) VALUES ($1, 0)', [wordId]);
    }
    res.json({ success: true });
  });

  app.get('/api/error-words', async (req, res) => {
    const words = await all(`
      SELECT w.* FROM words w 
      JOIN error_words ew ON w.id = ew.word_id
    `);
    res.json({ words });
  });

  app.get('/api/observation-words', async (req, res) => {
    const words = await all(`
      SELECT w.*, ow.correct_count FROM words w 
      JOIN observation_words ow ON w.id = ow.word_id
    `);
    res.json({ words });
  });

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

  app.post('/api/observation-words/:wordId/error', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM observation_words WHERE word_id = $1', [wordId]);
    const existing = await get('SELECT * FROM error_words WHERE word_id = $1', [wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (word_id) VALUES ($1)', [wordId]);
    }
    res.json({ success: true });
  });

  app.get('/api/yesterday-errors', async (req, res) => {
    const lastSession = await get('SELECT * FROM practice_sessions WHERE status = $1 ORDER BY id DESC LIMIT 1', ['completed']);
    
    if (!lastSession) {
      return res.json({ words: [], sessionId: null });
    }
    
    const words = await all(`
      SELECT w.*, ew.error_date FROM words w
      JOIN error_words ew ON w.id = ew.word_id
      WHERE ew.error_date >= $1 AND ew.error_date <= $2
      ORDER BY ew.error_date DESC
    `, [lastSession.start_time, lastSession.end_time]);
    
    res.json({ words, sessionId: lastSession.id });
  });

  app.post('/api/practice/start', async (req, res) => {
    await run('UPDATE practice_sessions SET status = $1 WHERE status = $2', ['abandoned', 'active']);
    
    await run('INSERT INTO practice_sessions (status) VALUES ($1)', ['active']);
    const session = await get('SELECT * FROM practice_sessions ORDER BY id DESC LIMIT 1');
    
    res.json({ success: true, sessionId: session?.id });
  });

  app.post('/api/practice/end', async (req, res) => {
    const { sessionId } = req.body;
    
    if (sessionId) {
      await run('UPDATE practice_sessions SET status = $1, end_time = CURRENT_TIMESTAMP WHERE id = $2', ['completed', sessionId]);
    } else {
      await run('UPDATE practice_sessions SET status = $1, end_time = CURRENT_TIMESTAMP WHERE status = $2', ['completed', 'active']);
    }
    
    res.json({ success: true });
  });

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

  app.get('/api/words/batch-relations', async (req, res) => {
    const wordIds = (req.query.ids as string)?.split(',').map(id => parseInt(id)) || [];
    
    if (wordIds.length === 0) {
      return res.json({ relations: [], wordMap: {} });
    }

    const placeholders = wordIds.map((_, i) => `$${i + 1}`).join(',');
    
    const words = await all(`SELECT * FROM words WHERE id IN (${placeholders})`, wordIds);
    
    const childIds = await all(`SELECT child_word_id FROM word_relations WHERE root_word_id IN (${placeholders})`, wordIds);
    const childWordIds = childIds.map(r => r.child_word_id);
    
    let childWords = [];
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

    let allWords;
    if (search) {
      const searchTerm = `%${search}%`;
      allWords = await all('SELECT * FROM words WHERE english LIKE $1 OR chinese LIKE $2', [searchTerm, searchTerm]);
    } else {
      allWords = await all('SELECT * FROM words ORDER BY english');
    }

    const relations = await all('SELECT * FROM word_relations');

    const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

    const wordMap = new Map<number, any>();
    const rootWords: any[] = [];
    const childWordIds = new Set<number>();

    allWords.forEach(word => {
      wordMap.set(word.id, {
        ...word,
        children: [],
        derivatives: [],
        phrases: []
      });
    });

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

    wordMap.forEach((word, id) => {
      if (!childWordIds.has(id)) {
        rootWords.push(word);
      }
    });

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

  app.get('/api/words/:id/relations', async (req, res) => {
    const wordId = parseInt(req.params.id);
    
    const word = await get('SELECT * FROM words WHERE id = $1', [wordId]);
    if (!word) {
      return res.status(404).json({ success: false, message: '单词不存在' });
    }

    const relations = await all('SELECT * FROM word_relations');
    const allWords = await all('SELECT * FROM words');
    
    const wordMap = new Map<number, any>();
    allWords.forEach(w => {
      wordMap.set(w.id, { ...w });
    });
    
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

  app.post('/api/relations', async (req, res) => {
    const { rootWordId, childWordId, relationType } = req.body;
    
    const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3', 
                        [rootWordId, childWordId, relationType]);
    
    if (existing) {
      return res.json({ success: false, message: '关系已存在' });
    }

    await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
        [rootWordId, childWordId, relationType]);

    res.json({ success: true });
  });

  app.delete('/api/relations/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    await run('DELETE FROM word_relations WHERE id = $1', [id]);
    res.json({ success: true });
  });

  app.delete('/api/relations/word/:wordId', async (req, res) => {
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM word_relations WHERE child_word_id = $1', [wordId]);
    res.json({ success: true });
  });

  app.post('/api/classify/all', async (req, res) => {
    const { keepManual = false, incremental = false } = req.body;

    try {
      if (!keepManual) {
        await run('DELETE FROM word_relations');
        await run('UPDATE words SET is_classified = 0');
      }

      let words;
      if (incremental) {
        words = await all('SELECT * FROM words WHERE is_classified = 0');
      } else {
        words = await all('SELECT * FROM words');
      }
      
      if (words.length === 0) {
        return res.json({ success: true, classified: 0 });
      }

      const allWords = await all('SELECT * FROM words');
      const rules = await all('SELECT * FROM classification_rules WHERE active = 1 ORDER BY priority DESC');

      const wordIndex = new Map<string, number>();
      allWords.forEach(w => {
        wordIndex.set(w.english.toLowerCase(), w.id);
      });

      let classifiedCount = 0;
      const processedIds: number[] = [];

      const sortedAllWords = [...allWords].sort((a, b) => a.english.length - b.english.length);

      for (const word of words) {
        const english = word.english.toLowerCase().trim();
        let wasClassified = false;
        
        if (english.includes(' ')) {
          const coreWord = extractCoreWord(english, wordIndex);
          if (coreWord && coreWord !== word.id) {
            const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                              [coreWord, word.id, 'phrase']);
            if (!existing) {
              await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
                  [coreWord, word.id, 'phrase']);
              wasClassified = true;
              classifiedCount++;
            }
          }
        } else {
          const rootWord = findBestRootWord(english, wordIndex, rules, sortedAllWords);
          if (rootWord && rootWord !== word.id) {
            const existing = await get('SELECT * FROM word_relations WHERE root_word_id = $1 AND child_word_id = $2 AND relation_type = $3',
                              [rootWord, word.id, 'derivative']);
            if (!existing) {
              await run('INSERT INTO word_relations (root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3)',
                  [rootWord, word.id, 'derivative']);
              wasClassified = true;
              classifiedCount++;
            }
          }
        }

        processedIds.push(word.id);
      }

      if (processedIds.length > 0) {
        const placeholders = processedIds.map((_, i) => `$${i + 1}`).join(',');
        await run(`UPDATE words SET is_classified = 1 WHERE id IN (${placeholders})`, processedIds);
      }

      res.json({ success: true, classified: classifiedCount, total: words.length });
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({ success: false, message: '分类失败' });
    }
  });
  
  app.post('/api/classify/reset', async (req, res) => {
    const { wordId } = req.body;
    
    try {
      await run('DELETE FROM word_relations WHERE child_word_id = $1', [wordId]);
      await run('DELETE FROM word_relations WHERE root_word_id = $1', [wordId]);
      await run('UPDATE words SET is_classified = 0 WHERE id = $1', [wordId]);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Reset classification error:', error);
      res.status(500).json({ success: false, message: '重置分类失败' });
    }
  });

  app.get('/api/words/roots', async (req, res) => {
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

  app.post('/api/db/save', async (req, res) => {
    try {
      saveDb();
      res.json({ success: true, message: '数据库已保存' });
    } catch (error) {
      console.error('Save error:', error);
      res.status(500).json({ success: false, message: '保存失败' });
    }
  });

  app.get('/api/db/status', async (req, res) => {
    const totalWordsResult = await get('SELECT COUNT(*) as count FROM words');
    const totalWords = totalWordsResult?.count || 0;
    res.json({
      success: true,
      totalWords,
      isHuggingFace: process.env.HF_TOKEN ? true : false,
      database: 'PostgreSQL'
    });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

function extractCoreWord(phrase: string, wordIndex: Map<string, number>): number | null {
  const parts = phrase.split(' ');
  
  if (wordIndex.has(parts[0])) {
    return wordIndex.get(parts[0]) || null;
  }
  
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

function findRootWord(word: string, wordIndex: Map<string, number>, rules: any[]): number | null {
  return findBestRootWord(word, wordIndex, rules, []);
}

app.get('/api/parts-of-speech', async (req, res) => {
  const parts = await all('SELECT * FROM parts_of_speech ORDER BY code');
  res.json({ success: true, data: parts });
});

app.post('/api/parts-of-speech', async (req, res) => {
  const { code, name, description } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ success: false, message: '代码和名称不能为空' });
  }
  
  try {
    await run('INSERT INTO parts_of_speech (code, name, description) VALUES ($1, $2, $3)',
        [code.trim(), name.trim(), description || '']);
    
    const newItem = await get('SELECT * FROM parts_of_speech ORDER BY id DESC LIMIT 1');
    res.json({ success: true, data: newItem });
  } catch (error: any) {
    if (error.message && error.message.includes('duplicate key')) {
      res.status(400).json({ success: false, message: '该代码已存在' });
    } else {
      console.error('Add part of speech error:', error);
      res.status(500).json({ success: false, message: '添加失败' });
    }
  }
});

app.put('/api/parts-of-speech/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { code, name, description } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ success: false, message: '代码和名称不能为空' });
  }
  
  try {
    await run('UPDATE parts_of_speech SET code = $1, name = $2, description = $3 WHERE id = $4',
        [code.trim(), name.trim(), description || '', id]);
    
    const updatedItem = await get('SELECT * FROM parts_of_speech WHERE id = $1', [id]);
    res.json({ success: true, data: updatedItem });
  } catch (error: any) {
    if (error.message && error.message.includes('duplicate key')) {
      res.status(400).json({ success: false, message: '该代码已存在' });
    } else {
      console.error('Update part of speech error:', error);
      res.status(500).json({ success: false, message: '更新失败' });
    }
  }
});

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

app.post('/api/parts-of-speech/init-from-words', async (req, res) => {
  try {
    const existingCodesResult = await all('SELECT code FROM parts_of_speech');
    const existingCodes = existingCodesResult.map((p: any) => p.code.toLowerCase());
    
    const posFromWords = await all('SELECT DISTINCT part_of_speech FROM words WHERE part_of_speech IS NOT NULL AND part_of_speech != \'\'');
    
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
    
    for (const pos of defaultPos) {
      if (!existingCodes.includes(pos.code.toLowerCase())) {
        await run('INSERT INTO parts_of_speech (code, name, description) VALUES ($1, $2, $3)',
            [pos.code, pos.name, pos.description]);
        addedCount++;
        existingCodes.push(pos.code.toLowerCase());
      }
    }
    
    for (const item of posFromWords) {
      const code = item.part_of_speech.trim();
      if (code && !existingCodes.includes(code.toLowerCase())) {
        await run('INSERT INTO parts_of_speech (code, name, description) VALUES ($1, $2, $3)',
            [code, code, '从导入数据中提取']);
        addedCount++;
        existingCodes.push(code.toLowerCase());
      }
    }
    
    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('Init parts of speech error:', error);
    res.status(500).json({ success: false, message: '初始化失败' });
  }
});

function findBestRootWord(word: string, wordIndex: Map<string, number>, rules: any[], allWords: any[]): number | null {
  let bestRoot: number | null = null;
  let bestRootLength = -1;
  
  for (const rule of rules) {
    const suffix = rule.suffix;
    
    if (word.endsWith(suffix)) {
      let root = word.slice(0, -suffix.length);
      
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
      
      if (wordIndex.has(root)) {
        if (root.length > bestRootLength) {
          bestRoot = wordIndex.get(root) || null;
          bestRootLength = root.length;
        }
      }
      
      if (root.endsWith('e') && wordIndex.has(root.slice(0, -1))) {
        const altRoot = root.slice(0, -1);
        if (altRoot.length > bestRootLength) {
          bestRoot = wordIndex.get(altRoot) || null;
          bestRootLength = altRoot.length;
        }
      }
    }
    
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