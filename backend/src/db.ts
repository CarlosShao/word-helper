import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

let db: SqlJsDatabase;
const dbFileName = 'word-helper.db';

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, dbFileName);

console.log(`[DB] Data directory: ${dataDir}`);

export async function initDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL,
      part_of_speech TEXT,
      chinese TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_classified INTEGER DEFAULT 0
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_words_english ON words(english)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_words_chinese ON words(chinese)`);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS error_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      error_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (word_id) REFERENCES words(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS observation_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL,
      correct_count INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (word_id) REFERENCES words(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS import_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'active'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS word_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_word_id INTEGER NOT NULL,
      child_word_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (root_word_id) REFERENCES words(id),
      FOREIGN KEY (child_word_id) REFERENCES words(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_relations_root ON word_relations(root_word_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_relations_child ON word_relations(child_word_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS classification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suffix TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS import_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_file_id INTEGER NOT NULL,
      index_number INTEGER NOT NULL,
      english TEXT,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (import_file_id) REFERENCES import_files(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS parts_of_speech (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existingRules = all('SELECT COUNT(*) as count FROM classification_rules');
  if (existingRules[0]?.count === 0) {
    const rules = [
      { suffix: 'tion', description: '名词后缀', priority: 10 },
      { suffix: 'ation', description: '名词后缀', priority: 10 },
      { suffix: 'al', description: '形容词后缀', priority: 9 },
      { suffix: 'ly', description: '副词后缀', priority: 8 },
      { suffix: 'er', description: '名词后缀(人/物)', priority: 7 },
      { suffix: 'or', description: '名词后缀(人/物)', priority: 7 },
      { suffix: 'ing', description: '动名词/形容词', priority: 6 },
      { suffix: 'ed', description: '过去式/分词', priority: 6 },
      { suffix: 'ness', description: '名词后缀', priority: 5 },
      { suffix: 'ment', description: '名词后缀', priority: 5 },
      { suffix: 'able', description: '形容词后缀', priority: 4 },
      { suffix: 'ible', description: '形容词后缀', priority: 4 },
      { suffix: 'ful', description: '形容词后缀', priority: 3 },
      { suffix: 'less', description: '形容词后缀', priority: 3 },
      { suffix: 'ity', description: '名词后缀', priority: 2 },
      { suffix: 'ize', description: '动词后缀', priority: 2 },
      { suffix: 'ise', description: '动词后缀', priority: 2 },
      { suffix: 'ous', description: '形容词后缀', priority: 1 },
      { suffix: 'ive', description: '形容词后缀', priority: 1 },
      { suffix: 'un', description: '否定前缀', priority: 0 },
      { suffix: 're', description: '重复前缀', priority: 0 },
      { suffix: 'pre', description: '前前缀', priority: 0 },
      { suffix: 'dis', description: '否定前缀', priority: 0 },
    ];
    rules.forEach(rule => {
      run('INSERT INTO classification_rules (suffix, description, priority, active) VALUES (?, ?, ?, ?)', 
          [rule.suffix, rule.description, rule.priority, 1]);
    });
  }
  
  console.log('[DB] Initialization complete');
  
  return db;
}

export function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log('[DB] Database saved');
}

export function getDb(): SqlJsDatabase {
  return db;
}

export function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
}

export function batchRun(operations: Array<{ sql: string; params?: any[] }>): void {
  operations.forEach(op => {
    db.run(op.sql, op.params || []);
  });
}

export function all(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

export function get(sql: string, params: any[] = []): any | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}
