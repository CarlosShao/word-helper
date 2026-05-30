import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb, run, all, get, withClient, batchInsert, batchUpdate, batchDelete, checkExisting } from './db';
import { parsePdf } from './pdfParser';
import { authRouter, getUserIdFromToken } from './auth';

const captchaStore = new Map<string, { code: string; expiresAt: number }>();

interface WordCacheEntry {
  words: any[];
  timestamp: number;
}
const wordCache = new Map<number, WordCacheEntry>();
const CACHE_DURATION = 300000;

const getCachedWords = (userId: number): any[] | null => {
  const entry = wordCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_DURATION) {
    wordCache.delete(userId);
    return null;
  }
  return entry.words;
};

const setCachedWords = (userId: number, words: any[]): void => {
  wordCache.set(userId, {
    words,
    timestamp: Date.now()
  });
};

const invalidateWordCache = (userId: number): void => {
  wordCache.delete(userId);
};

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

async function extractUserId(req: express.Request): Promise<number | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return getUserIdFromToken(token);
}

const isProduction = process.env.NODE_ENV === 'production';

const corsOptions = {
  origin: function (origin: any, callback: any) {
    if (isProduction) {
      callback(null, true);
    } else {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        /\.onrender\.com$/,
        /\.vercel\.app$/,
        /\.netlify\.app$/
      ];
      
      if (!origin || allowedOrigins.some((pattern: any) => 
        typeof pattern === 'string' ? origin === pattern : pattern.test(origin)
      )) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function generateCaptchaCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateCaptchaImage(code: string): string {
  const width = 120;
  const height = 40;
  const fontSize = 24;
  const chars = code.split('');
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="#f5f5f5" rx="4"/>`;
  
  chars.forEach((char, index) => {
    const x = 15 + index * 25;
    const y = height / 2 + fontSize / 3;
    const rotate = (Math.random() - 0.5) * 30;
    const color = `rgb(${Math.floor(Math.random() * 100) + 50}, ${Math.floor(Math.random() * 100) + 50}, ${Math.floor(Math.random() * 100) + 50})`;
    svg += `<text x="${x}" y="${y}" font-size="${fontSize}" font-weight="bold" fill="${color}" transform="rotate(${rotate}, ${x}, ${y})" text-anchor="middle">${char}</text>`;
  });
  
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ddd" stroke-width="1"/>`;
  }
  
  svg += '</svg>';
  return svg;
}

app.get('/api/captcha', (req, res) => {
  const code = generateCaptchaCode();
  const svg = generateCaptchaImage(code);
  const uuid = Math.random().toString(36).substring(2, 15);
  const expiresAt = Date.now() + 5 * 60 * 1000;
  
  captchaStore.set(uuid, { code: code.toLowerCase(), expiresAt });
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('captcha-uuid', uuid);
  res.send(svg);
});

app.post('/api/captcha/verify', (req, res) => {
  const { uuid, code } = req.body;
  
  if (!uuid || !code) {
    return res.json({ success: false, message: 'Please enter captcha' });
  }
  
  const captcha = captchaStore.get(uuid);
  
  if (!captcha) {
    return res.json({ success: false, message: 'Captcha expired, please refresh' });
  }
  
  if (Date.now() > captcha.expiresAt) {
    captchaStore.delete(uuid);
    return res.json({ success: false, message: 'Captcha expired, please refresh' });
  }
  
  if (code.toLowerCase() === captcha.code) {
    captchaStore.delete(uuid);
    return res.json({ success: true });
  }
  
  return res.json({ success: false, message: 'Invalid captcha' });
});

async function startServer() {
  await initDb();

  const staticDir = path.join(__dirname, '../public');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }
  
  // 上传的图片静态文件路由
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `bg-${uniqueSuffix}${ext}`);
    }
  });

  const upload = multer({ storage });

  app.use('/api/auth', authRouter);

  // 上传图片接口
  app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
      const userId = await extractUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ url: imageUrl });
      
    } catch (error) {
      console.error('[Upload Image] Error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.post('/api/import', upload.single('file'), async (req, res) => {
    try {
      const userId = await extractUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      console.log('[Import] Starting import process for user:', userId);
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('[Import] Parsing PDF file...');
      const filePath = req.file.path;
      const parseResult = await parsePdf(filePath);
      const { words, errors } = parseResult;
      console.log(`[Import] Parsed ${words.length} words, ${errors.length} errors`);

      console.log('[Import] Starting database operations...');
      
      await withClient(async (client) => {
        console.log('[Import] Transaction started');
        
        await client.query('BEGIN');
        
        try {
          console.log('[Import] Creating import file record...');
          await client.query('INSERT INTO import_files (user_id, filename) VALUES ($1, $2)', [userId, req.file!.originalname]);
          const importFileResult = await client.query('SELECT id FROM import_files ORDER BY id DESC LIMIT 1');
          const importFileId = importFileResult.rows[0]?.id || 0;
          console.log(`[Import] Import file ID: ${importFileId}`);

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

          console.log('[Import] Clearing existing words for this user...');
          await client.query('DELETE FROM word_relations WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM error_words WHERE word_id IN (SELECT id FROM words WHERE user_id = $1)', [userId]);
          await client.query('DELETE FROM observation_words WHERE word_id IN (SELECT id FROM words WHERE user_id = $1)', [userId]);
          await client.query('DELETE FROM words WHERE user_id = $1', [userId]);
          console.log('[Import] User words cleared');

          if (words.length > 0) {
            console.log(`[Import] Inserting ${words.length} words in batches...`);
            const wordValues = words.map(w => [userId, w.english, w.part_of_speech, w.chinese, 0]);
            const batchSize = 100;
            
            for (let i = 0; i < wordValues.length; i += batchSize) {
              const batch = wordValues.slice(i, i + batchSize);
              const placeholders = batch.map((_, rowIndex) => 
                `($${rowIndex * 5 + 1}, $${rowIndex * 5 + 2}, $${rowIndex * 5 + 3}, $${rowIndex * 5 + 4}, $${rowIndex * 5 + 5})`
              ).join(', ');
              
              await client.query(
                'INSERT INTO words (user_id, english, part_of_speech, chinese, is_classified) VALUES ' + placeholders,
                batch.flat()
              );
              
              if ((i + batchSize) % 1000 === 0 || i + batchSize >= wordValues.length) {
                console.log(`[Import] Inserted ${Math.min(i + batchSize, wordValues.length)} words`);
              }
            }
          }

          console.log('[Import] Starting auto-classification...');
          const allWords = await client.query('SELECT * FROM words WHERE user_id = $1', [userId]);
          const rules = await client.query('SELECT * FROM classification_rules WHERE user_id IS NULL OR user_id = $1 AND active = 1 ORDER BY user_id NULLS FIRST, priority DESC', [userId]);
          const existingRelations = await client.query('SELECT * FROM word_relations WHERE user_id = $1', [userId]);
          
          const wordsToClassify = allWords.rows;
          const ruleList = rules.rows;
          const existing = existingRelations.rows;
          
          console.log(`[Classification] Classifying ${wordsToClassify.length} words with ${ruleList.length} rules...`);
          
          const wordIndex = new Map<string, number>();
          wordsToClassify.forEach((w: any) => {
            wordIndex.set(w.english.toLowerCase(), w.id);
          });
          
          const existingIndex = new Set<string>();
          existing.forEach((r: any) => {
            existingIndex.add(`${r.root_word_id}-${r.child_word_id}-${r.relation_type}`);
          });

          const relationsToInsert: Array<{ user_id: number; root: number; child: number; type: string }> = [];
          const processedIds: number[] = [];

          for (const word of wordsToClassify as any[]) {
            const english = word.english.toLowerCase().trim();
            let wasClassified = false;
            
            if (english.includes(' ')) {
              const coreWord = extractCoreWord(english, wordIndex);
              if (coreWord && coreWord !== word.id) {
                const key = `${coreWord}-${word.id}-phrase`;
                if (!existingIndex.has(key)) {
                  relationsToInsert.push({ user_id: userId, root: coreWord, child: word.id, type: 'phrase' });
                  wasClassified = true;
                }
              }
            } else {
              const rootWord = findRootWord(english, wordIndex, ruleList);
              if (rootWord && rootWord !== word.id) {
                const key = `${rootWord}-${word.id}-derivative`;
                if (!existingIndex.has(key)) {
                  relationsToInsert.push({ user_id: userId, root: rootWord, child: word.id, type: 'derivative' });
                  wasClassified = true;
                }
              }
            }
            
            if (wasClassified) {
              processedIds.push(word.id);
            }
          }

          if (relationsToInsert.length > 0) {
            console.log(`[Classification] Inserting ${relationsToInsert.length} relations...`);
            
            const batchSize = 100;
            for (let i = 0; i < relationsToInsert.length; i += batchSize) {
              const batch = relationsToInsert.slice(i, i + batchSize);
              const placeholders = batch.map((_, rowIndex) => 
                `($${rowIndex * 4 + 1}, $${rowIndex * 4 + 2}, $${rowIndex * 4 + 3}, $${rowIndex * 4 + 4})`
              ).join(', ');
              
              await client.query(
                'INSERT INTO word_relations (user_id, root_word_id, child_word_id, relation_type) VALUES ' + placeholders,
                batch.flatMap(r => [r.user_id, r.root, r.child, r.type])
              );
            }
            
            if (processedIds.length > 0) {
              const paramPlaceholders = processedIds.map((_, i) => `$${i + 2}`).join(',');
              await client.query(`UPDATE words SET is_classified = 1 WHERE user_id = $1 AND id IN (${paramPlaceholders})`, [userId, ...processedIds]);
            }
            
            console.log('[Classification] Auto-classification completed successfully');
          } else {
            console.log('[Classification] No relations to insert');
          }

          await client.query('COMMIT');
          console.log('[Import] Database transaction committed successfully');
          
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('[Import] Rollback due to error:', error);
          throw error;
        }
      });

      console.log('[Import] Import process completed successfully');
      res.json({ success: true, count: words.length, errorCount: errors.length, errors });
    } catch (error) {
      console.error('[Import] Import error:', error);
      res.status(500).json({ error: 'Failed to import file', details: String(error) });
    }
  });

  app.get('/api/import-errors', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const errors = await all(`
      SELECT 
        import_error_logs.*,
        import_files.filename,
        import_files.imported_at
      FROM import_error_logs 
      LEFT JOIN import_files ON import_error_logs.import_file_id = import_files.id
      WHERE import_files.user_id = $1
      ORDER BY import_error_logs.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    res.json({ success: true, errors });
  });

  app.get('/api/import-stats', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const recentImports = await all(`
      SELECT 
        import_files.*,
        COUNT(import_error_logs.id) as error_count
      FROM import_files
      LEFT JOIN import_error_logs ON import_files.id = import_error_logs.import_file_id
      WHERE import_files.user_id = $1
      GROUP BY import_files.id
      ORDER BY import_files.imported_at DESC
      LIMIT 10
    `, [userId]);
    res.json({ success: true, imports: recentImports });
  });

  app.get('/api/words', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * pageSize;

    const wordIds: number[] = [];
    let total = 0;
    
    let words: any[];
    if (search) {
      const searchTerm = `%${search}%`;
      const [wordsResult, countResult] = await Promise.all([
        all('SELECT * FROM words WHERE user_id = $1 AND (english LIKE $2 OR chinese LIKE $3) ORDER BY english LIMIT $4 OFFSET $5', 
            [userId, searchTerm, searchTerm, pageSize, offset]),
        get('SELECT COUNT(*) as total FROM words WHERE user_id = $1 AND (english LIKE $2 OR chinese LIKE $3)', 
            [userId, searchTerm, searchTerm])
      ]);
      words = wordsResult;
      total = parseInt(countResult?.total) || 0;
    } else {
      const [wordsResult, countResult] = await Promise.all([
        all('SELECT * FROM words WHERE user_id = $1 ORDER BY english LIMIT $2 OFFSET $3', [userId, pageSize, offset]),
        get('SELECT COUNT(*) as total FROM words WHERE user_id = $1', [userId])
      ]);
      words = wordsResult;
      total = parseInt(countResult?.total) || 0;
    }
    
    words.forEach(w => wordIds.push(w.id));

    let relations: any[] = [];
    let childWords: any[] = [];
    let childWordIds: number[] = [];
    let allChildWordIds: Set<number> = new Set();
    
    if (wordIds.length > 0) {
      const params = [userId, ...wordIds];
      const placeholders = wordIds.map((_, i) => `$${i + 2}`).join(',');
      
      const [relationsResult, childIdsResult] = await Promise.all([
        all(`SELECT * FROM word_relations WHERE user_id = $1 AND root_word_id IN (${placeholders})`, params),
        all(`SELECT DISTINCT child_word_id FROM word_relations WHERE user_id = $1 AND root_word_id IN (${placeholders})`, params)
      ]);
      
      relations = relationsResult;
      childIdsResult.forEach((r: any) => allChildWordIds.add(r.child_word_id));
      
      childWordIds = [...allChildWordIds];
      
      if (childWordIds.length > 0) {
        const params = [userId, ...childWordIds];
        const childPlaceholders = childWordIds.map((_, i) => `$${i + 2}`).join(',');
        childWords = await all(`SELECT * FROM words WHERE user_id = $1 AND id IN (${childPlaceholders})`, params);
      }
    }
    
    const wordMap = new Map<number, any>();
    words.forEach(w => wordMap.set(w.id, { ...w, derivatives: [], phrases: [] }));
    childWords.forEach(w => wordMap.set(w.id, { ...w, derivatives: [], phrases: [] }));
    
    relations.forEach((r: any) => {
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
      const children: any[] = [];
      
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

  app.get('/api/words/all', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cachedWords = getCachedWords(userId);
    if (cachedWords) {
      console.log(`[DEBUG-CACHE] Returning cached words for user ${userId}`);
      return res.json({ success: true, words: cachedWords });
    }

    try {
      const words = await all('SELECT * FROM words WHERE user_id = $1 ORDER BY english', [userId]);
      setCachedWords(userId, words);
      console.log(`[DEBUG-CACHE] Cached ${words.length} words for user ${userId}`);
      res.json({ success: true, words });
    } catch (error) {
      console.error('Get all words error:', error);
      res.status(500).json({ success: false, message: '获取单词失败' });
    }
  });

  app.put('/api/words/:id', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wordId = parseInt(req.params.id);
    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      await run('UPDATE words SET english = $1, part_of_speech = $2, chinese = $3 WHERE user_id = $4 AND id = $5',
          [english, part_of_speech || '', chinese, userId, wordId]);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Update word error:', error);
      res.status(500).json({ success: false, message: '更新失败' });
    }
  });

  app.get('/api/words/index/:wordId', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wordId = parseInt(req.params.wordId);
    
    try {
      const result = await get(`
        SELECT COUNT(*) as word_index 
        FROM words 
        WHERE user_id = $1 AND english < (SELECT english FROM words WHERE user_id = $1 AND id = $2)
      `, [userId, wordId]);
      
      const totalResult = await get('SELECT COUNT(*) as total FROM words WHERE user_id = $1', [userId]);
      
      res.json({
        success: true,
        data: {
          index: parseInt(result?.word_index) || 0,
          total: parseInt(totalResult?.total) || 0
        }
      });
    } catch (error) {
      console.error('Get word index error:', error);
      res.status(500).json({ success: false, message: '获取索引失败' });
    }
  });

  app.post('/api/words', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { english, part_of_speech, chinese } = req.body;
    
    try {
      if (!english || !chinese) {
        return res.status(400).json({ success: false, message: '英文和中文不能为空' });
      }
      
      const result = await run('INSERT INTO words (user_id, english, part_of_speech, chinese, is_classified) VALUES ($1, $2, $3, $4, 0) RETURNING *',
          [userId, english, part_of_speech || '', chinese]);
      
      const newWord = result.rows[0];
      
      res.json({ success: true, word: newWord });
    } catch (error) {
      console.error('Add word error:', error);
      res.status(500).json({ success: false, message: '添加失败' });
    }
  });

  app.delete('/api/words/:id', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wordId = parseInt(req.params.id);
    
    try {
      console.log(`[DeleteWord] Deleting word ${wordId} for user ${userId}...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        await client.query('DELETE FROM word_relations WHERE user_id = $1 AND (root_word_id = $2 OR child_word_id = $2)', [userId, wordId]);
        await client.query('DELETE FROM error_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
        await client.query('DELETE FROM observation_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
        await client.query('DELETE FROM words WHERE user_id = $1 AND id = $2', [userId, wordId]);
        
        await client.query('COMMIT');
      });
      
      console.log('[DeleteWord] Complete');
      res.json({ success: true });
    } catch (error) {
      console.error('[DeleteWord] Error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  app.post('/api/words/batch-delete', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { wordIds } = req.body;
    
    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要删除的单词' });
    }
    
    try {
      console.log(`[BatchDelete] Deleting ${wordIds.length} words for user ${userId}...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        const params = [userId, ...wordIds, ...wordIds];
        const placeholders1 = wordIds.map((_, i) => `$${i + 2}`).join(',');
        const placeholders2 = wordIds.map((_, i) => `$${i + wordIds.length + 2}`).join(',');
        
        await client.query(`DELETE FROM word_relations WHERE user_id = $1 AND (root_word_id IN (${placeholders1}) OR child_word_id IN (${placeholders2}))`, params);
        await client.query(`DELETE FROM error_words WHERE user_id = $1 AND word_id IN (${placeholders1})`, [userId, ...wordIds]);
        await client.query(`DELETE FROM observation_words WHERE user_id = $1 AND word_id IN (${placeholders1})`, [userId, ...wordIds]);
        await client.query(`DELETE FROM words WHERE user_id = $1 AND id IN (${placeholders1})`, [userId, ...wordIds]);
        
        await client.query('COMMIT');
      });
      
      console.log('[BatchDelete] Complete');
      res.json({ success: true, deletedCount: wordIds.length });
    } catch (error) {
      console.error('[BatchDelete] Error:', error);
      res.status(500).json({ success: false, message: '批量删除失败' });
    }
  });

  app.post('/api/error-words', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { wordId } = req.body;
    const existing = await get('SELECT * FROM error_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (user_id, word_id) VALUES ($1, $2)', [userId, wordId]);
    }
    res.json({ success: true });
  });

  app.delete('/api/error-words/:wordId', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM error_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    const existing = await get('SELECT * FROM observation_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    if (!existing) {
      await run('INSERT INTO observation_words (user_id, word_id, correct_count) VALUES ($1, $2, 0)', [userId, wordId]);
    }
    res.json({ success: true });
  });

  app.get('/api/error-words', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const words = await all(`
      SELECT w.* FROM words w 
      JOIN error_words ew ON w.id = ew.word_id
      WHERE w.user_id = $1
    `, [userId]);
    res.json({ words });
  });

  app.get('/api/observation-words', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const words = await all(`
      SELECT w.*, ow.correct_count FROM words w 
      JOIN observation_words ow ON w.id = ow.word_id
      WHERE w.user_id = $1
    `, [userId]);
    res.json({ words });
  });

  app.post('/api/observation-words/:wordId/correct', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const wordId = parseInt(req.params.wordId);
    const word = await get('SELECT * FROM observation_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    
    if (word) {
      const correctCount = parseInt(String(word.correct_count || '0'));
      const newCount = correctCount + 1;
      if (newCount >= 2) {
        await run('DELETE FROM observation_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
      } else {
        await run('UPDATE observation_words SET correct_count = $1 WHERE user_id = $2 AND word_id = $3', [newCount, userId, wordId]);
      }
    }
    
    res.json({ success: true });
  });

  app.post('/api/observation-words/:wordId/error', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM observation_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    const existing = await get('SELECT * FROM error_words WHERE user_id = $1 AND word_id = $2', [userId, wordId]);
    if (!existing) {
      await run('INSERT INTO error_words (user_id, word_id) VALUES ($1, $2)', [userId, wordId]);
    }
    res.json({ success: true });
  });

  app.get('/api/yesterday-errors', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const today = new Date();
    const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const words = await all(`
      SELECT DISTINCT w.*, ew.error_date FROM words w
      JOIN error_words ew ON w.id = ew.word_id
      WHERE w.user_id = $1 AND ew.error_date >= $2 AND ew.error_date < $3
      ORDER BY ew.error_date DESC
    `, [userId, yesterdayStart, yesterdayEnd]);
    
    res.json({ words, sessionId: null });
  });

  app.post('/api/practice/start', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    await run('UPDATE practice_sessions SET status = $1 WHERE user_id = $2 AND status = $3', ['abandoned', userId, 'active']);
    
    await run('INSERT INTO practice_sessions (user_id, start_time, status) VALUES ($1, NOW(), $2)', [userId, 'active']);
    const session = await get('SELECT * FROM practice_sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
    
    res.json({ success: true, sessionId: session?.id });
  });

  app.post('/api/practice/end', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const { sessionId } = req.body;
    
    if (sessionId) {
      await run('UPDATE practice_sessions SET status = $1, end_time = NOW() WHERE user_id = $2 AND id = $3', ['completed', userId, sessionId]);
    } else {
      await run('UPDATE practice_sessions SET status = $1, end_time = NOW() WHERE user_id = $2 AND status = $3', ['completed', userId, 'active']);
    }
    
    res.json({ success: true });
  });

  app.get('/api/settings/:key', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { key } = req.params;
    const setting = await get('SELECT value FROM settings WHERE user_id = $1 AND key = $2', [userId, key]);
    res.json({ value: setting?.value || null });
  });

  app.post('/api/settings/:key', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { key } = req.params;
    const { value } = req.body;
    const existing = await get('SELECT * FROM settings WHERE user_id = $1 AND key = $2', [userId, key]);
    if (existing) {
      await run('UPDATE settings SET value = $1, updated_at = NOW() WHERE user_id = $2 AND key = $3', [value, userId, key]);
    } else {
      await run('INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3)', [userId, key, value]);
    }
    res.json({ success: true });
  });

  app.get('/api/words/batch-relations', async (req, res) => {
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wordIds = (req.query.ids as string)?.split(',').map(id => parseInt(id)) || [];
    
    if (wordIds.length === 0) {
      return res.json({ relations: [], wordMap: {} });
    }

    const params = [userId, ...wordIds];
    const placeholders = wordIds.map((_, i) => `$${i + 2}`).join(',');
    
    const words = await all(`SELECT * FROM words WHERE user_id = $1 AND id IN (${placeholders})`, params);
    
    const childIdsResult = await all(`SELECT child_word_id FROM word_relations WHERE user_id = $1 AND root_word_id IN (${placeholders})`, params);
    const childWordIds = childIdsResult.map((r: any) => r.child_word_id);
    
    let childWords: any[] = [];
    if (childWordIds.length > 0) {
      const childParams = [userId, ...childWordIds];
      const childPlaceholders = childWordIds.map((_, i) => `$${i + 2}`).join(',');
      childWords = await all(`SELECT * FROM words WHERE user_id = $1 AND id IN (${childPlaceholders})`, childParams);
    }
    
    const allWordsData = [...words, ...childWords];
    const wordMap = new Map<number, any>();
    allWordsData.forEach(w => {
      wordMap.set(w.id, { ...w, derivatives: [], phrases: [] });
    });
    
    const relations = await all(`SELECT * FROM word_relations WHERE user_id = $1 AND root_word_id IN (${placeholders})`, params);
    
    relations.forEach((rel: any) => {
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
    const userId = await extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const search = (req.query.search as string) || '';

    let allWords: any[];
    if (search) {
      const searchTerm = `%${search}%`;
      allWords = await all('SELECT * FROM words WHERE user_id = $1 AND (english LIKE $2 OR chinese LIKE $3)', [userId, searchTerm, searchTerm]);
    } else {
      allWords = await all('SELECT * FROM words WHERE user_id = $1 ORDER BY english', [userId]);
    }

    const relations = await all('SELECT * FROM word_relations WHERE user_id = $1', [userId]);

    const rules = await all('SELECT * FROM classification_rules WHERE (user_id IS NULL OR user_id = $1) AND active = 1 ORDER BY user_id NULLS FIRST, priority DESC', [userId]);

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

    relations.forEach((rel: any) => {
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const wordId = parseInt(req.params.id);
    
    const word = await get('SELECT * FROM words WHERE user_id = $1 AND id = $2', [userId, wordId]);
    if (!word) {
      return res.status(404).json({ success: false, message: '单词不存在' });
    }

    const relations = await all('SELECT * FROM word_relations WHERE user_id = $1', [userId]);
    const allWords = await all('SELECT * FROM words WHERE user_id = $1', [userId]);
    
    const wordMap = new Map<number, any>();
    allWords.forEach(w => {
      wordMap.set(w.id, { ...w });
    });
    
    const derivatives: any[] = [];
    const phrases: any[] = [];
    
    relations.forEach((rel: any) => {
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const { rootWordId, childWordId, relationType } = req.body;
    
    const existing = await get('SELECT * FROM word_relations WHERE user_id = $1 AND root_word_id = $2 AND child_word_id = $3 AND relation_type = $4', 
                        [userId, rootWordId, childWordId, relationType]);
    
    if (existing) {
      return res.json({ success: false, message: '关系已存在' });
    }

    await run('INSERT INTO word_relations (user_id, root_word_id, child_word_id, relation_type) VALUES ($1, $2, $3, $4)',
        [userId, rootWordId, childWordId, relationType]);

    res.json({ success: true });
  });

  app.delete('/api/relations/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const id = parseInt(req.params.id);
    await run('DELETE FROM word_relations WHERE user_id = $1 AND id = $2', [userId, id]);
    res.json({ success: true });
  });

  app.delete('/api/relations/word/:wordId', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const wordId = parseInt(req.params.wordId);
    await run('DELETE FROM word_relations WHERE user_id = $1 AND child_word_id = $2', [userId, wordId]);
    res.json({ success: true });
  });

  app.post('/api/classify/all', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const { keepManual = false, incremental = false, resetOnly = false } = req.body;

    try {
      if (resetOnly) {
        console.log('[Classify] Resetting all classifications only...');
        await run('DELETE FROM word_relations WHERE user_id = $1', [userId]);
        await run('UPDATE words SET is_classified = 0 WHERE user_id = $1', [userId]);
        console.log('[Classify] Reset complete');
        return res.json({ success: true, classified: 0 });
      }

      console.log('[Classify] Starting classification...');

      if (!keepManual) {
        console.log('[Classify] Clearing existing relations...');
        await run('DELETE FROM word_relations WHERE user_id = $1', [userId]);
        await run('UPDATE words SET is_classified = 0 WHERE user_id = $1', [userId]);
      }

      let words: any[];
      if (incremental) {
        words = await all('SELECT * FROM words WHERE user_id = $1 AND is_classified = 0', [userId]);
      } else {
        words = await all('SELECT * FROM words WHERE user_id = $1', [userId]);
      }
      
      if (words.length === 0) {
        console.log('[Classify] No words to classify');
        return res.json({ success: true, classified: 0 });
      }

      console.log(`[Classify] Classifying ${words.length} words...`);

      const allWords = await all('SELECT * FROM words WHERE user_id = $1', [userId]);
      const rules = await all('SELECT * FROM classification_rules WHERE (user_id IS NULL OR user_id = $1) AND active = 1 ORDER BY user_id NULLS FIRST, priority DESC', [userId]);

      const wordIndex = new Map<string, number>();
      allWords.forEach(w => {
        wordIndex.set(w.english.toLowerCase(), w.id);
      });

      const relationsToInsert: Array<{ user_id: number; root: number; child: number; type: string }> = [];
      const processedIds: number[] = [];

      const sortedAllWords = [...allWords].sort((a, b) => a.english.length - b.english.length);

      const existingRelations = await all('SELECT root_word_id, child_word_id, relation_type FROM word_relations WHERE user_id = $1', [userId]);
      const existingRelSet = new Set(existingRelations.map(r => `${r.root_word_id}-${r.child_word_id}-${r.relation_type}`));

      for (const word of words) {
        const english = word.english.toLowerCase().trim();
        let wasClassified = false;
        
        if (english.includes(' ')) {
          const coreWord = extractCoreWord(english, wordIndex);
          if (coreWord && coreWord !== word.id) {
            const key = `${coreWord}-${word.id}-phrase`;
            if (!existingRelSet.has(key)) {
              relationsToInsert.push({ user_id: userId, root: coreWord, child: word.id, type: 'phrase' });
              wasClassified = true;
            }
          }
        } else {
          const rootWord = findBestRootWord(english, wordIndex, rules, sortedAllWords);
          if (rootWord && rootWord !== word.id) {
            const key = `${rootWord}-${word.id}-derivative`;
            if (!existingRelSet.has(key)) {
              relationsToInsert.push({ user_id: userId, root: rootWord, child: word.id, type: 'derivative' });
              wasClassified = true;
            }
          }
        }

        if (wasClassified || (!incremental)) {
          processedIds.push(word.id);
        }
      }

      console.log(`[Classify] Inserting ${relationsToInsert.length} relations...`);

      if (relationsToInsert.length > 0) {
        const relationValues = relationsToInsert.map(r => [r.user_id, r.root, r.child, r.type]);
        await batchInsert('word_relations', ['user_id', 'root_word_id', 'child_word_id', 'relation_type'], relationValues);
      }

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
  
  app.post('/api/classify/reset', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const { wordId } = req.body;
    
    try {
      console.log(`[ResetClassify] Resetting word ${wordId}...`);
      
      await withClient(async (client) => {
        await client.query('BEGIN');
        
        await client.query('DELETE FROM word_relations WHERE user_id = $1 AND child_word_id = $2', [userId, wordId]);
        await client.query('DELETE FROM word_relations WHERE user_id = $1 AND root_word_id = $2', [userId, wordId]);
        await client.query('UPDATE words SET is_classified = 0 WHERE user_id = $1 AND id = $2', [userId, wordId]);
        
        await client.query('COMMIT');
      });
      
      console.log('[ResetClassify] Complete');
      res.json({ success: true });
    } catch (error) {
      console.error('[ResetClassify] Error:', error);
      res.status(500).json({ success: false, message: '重置分类失败' });
    }
  });

  app.get('/api/words/roots', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const childIdsResult = await all('SELECT DISTINCT child_word_id FROM word_relations WHERE user_id = $1', [userId]);
    const childIds = childIdsResult.map((r: any) => r.child_word_id);
    let roots: any[];
    
    if (childIds.length > 0) {
      const params = [userId, ...childIds];
      const placeholders = childIds.map((_, i) => `$${i + 2}`).join(',');
      roots = await all(`SELECT * FROM words WHERE user_id = $1 AND id NOT IN (${placeholders}) ORDER BY english`, params);
    } else {
      roots = await all('SELECT * FROM words WHERE user_id = $1 ORDER BY english', [userId]);
    }
    
    res.json({ words: roots });
  });

  app.get('/api/db/status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: '无效的token' });
    }
    
    const totalResult = await get('SELECT COUNT(*) as count FROM words WHERE user_id = $1', [userId]);
    res.json({
      success: true,
      totalWords: totalResult?.count || 0,
      isHuggingFace: process.env.HF_TOKEN ? true : false
    });
  });

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

  const staticDir = path.join(__dirname, '../public');
  if (fs.existsSync(staticDir)) {
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
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