import { Pool, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432');
const dbName = process.env.DB_NAME || 'wordhelper';
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || '';

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  database: dbName,
  user: dbUser,
  password: dbPassword,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

console.log(`[DB] Connecting to PostgreSQL: ${dbUser}@${dbHost}:${dbPort}/${dbName}`);

export async function initDb(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        english TEXT NOT NULL,
        part_of_speech TEXT,
        chinese TEXT NOT NULL,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_classified INTEGER DEFAULT 0
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_english ON words(english)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_chinese ON words(chinese)`);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL,
        error_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id)
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS observation_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL,
        correct_count INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id)
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status TEXT DEFAULT 'active'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS word_relations (
        id SERIAL PRIMARY KEY,
        root_word_id INTEGER NOT NULL,
        child_word_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (root_word_id) REFERENCES words(id),
        FOREIGN KEY (child_word_id) REFERENCES words(id)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_relations_root ON word_relations(root_word_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_relations_child ON word_relations(child_word_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS classification_rules (
        id SERIAL PRIMARY KEY,
        suffix TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_error_logs (
        id SERIAL PRIMARY KEY,
        import_file_id INTEGER NOT NULL,
        index_number INTEGER NOT NULL,
        english TEXT,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (import_file_id) REFERENCES import_files(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parts_of_speech (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const existingRules = await pool.query('SELECT COUNT(*) as count FROM classification_rules');
    if (existingRules.rows[0]?.count === 0) {
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
      
      for (const rule of rules) {
        await pool.query(
          'INSERT INTO classification_rules (suffix, description, priority, active) VALUES ($1, $2, $3, $4)',
          [rule.suffix, rule.description, rule.priority, 1]
        );
      }
    }
    
    console.log('[DB] PostgreSQL initialization complete');
  } catch (error) {
    console.error('[DB] Initialization error:', error);
    throw error;
  }
}

export function saveDb(): void {
  console.log('[DB] PostgreSQL auto-saves, no manual save needed');
}

export function getPool(): Pool {
  return pool;
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  await pool.query(sql, params);
}

export async function batchRun(operations: Array<{ sql: string; params?: any[] }>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const op of operations) {
      await client.query(op.sql, op.params || []);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function all(sql: string, params: any[] = []): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function get(sql: string, params: any[] = []): Promise<any | null> {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

export async function getLastInsertId(table: string = 'words'): Promise<number> {
  const result = await pool.query(`SELECT lastval() as id`);
  return result.rows[0]?.id || 0;
}