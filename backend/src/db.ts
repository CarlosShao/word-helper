import { Pool, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';

let pool: Pool;
let dbHostIPv4: string | null = process.env.DB_HOST_IPV4 || null;

async function resolveIPv4(host: string): Promise<string> {
  if (dbHostIPv4) {
    console.log(`[DB] Using configured IPv4: ${dbHostIPv4}`);
    return dbHostIPv4;
  }
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return host;
  }
  try {
    const records = await dns.resolve4(host);
    if (records.length > 0) {
      console.log(`[DB] Resolved IPv4 for ${host}: ${records[0]}`);
      return records[0];
    }
  } catch (error) {
    console.warn(`[DB] Failed to resolve IPv4 for ${host}, using original: ${error}`);
  }
  return host;
}

export async function createPool(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const url = new URL(databaseUrl);
  
  const host = url.hostname;
  const resolvedHost = await resolveIPv4(host);
  
  const sslMode = process.env.PGSSLMODE || 'require';
  
  pool = new Pool({
    host: resolvedHost,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    ssl: sslMode === 'require' || sslMode === 'prefer' ? {
      rejectUnauthorized: false
    } : undefined
  });
  console.log(`[DB] Connecting to PostgreSQL: ${url.username}@${resolvedHost}:${url.port}${url.pathname} (SSL: ${sslMode})`);
}

export async function initDb(): Promise<void> {
  await createPool();
  
  try {
    console.log('[DB] Creating users table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        provider TEXT DEFAULT 'local',
        provider_id TEXT,
        avatar_url TEXT,
        email_verified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id)`);
    console.log('[DB] users table created');

    console.log('[DB] Creating user_sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at)`);
    console.log('[DB] user_sessions table created');

    console.log('[DB] Creating password_resets table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`);
    console.log('[DB] password_resets table created');

    console.log('[DB] Creating words table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        english TEXT NOT NULL,
        part_of_speech TEXT,
        chinese TEXT NOT NULL,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_classified INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_english ON words(english)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_chinese ON words(chinese)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_user ON words(user_id)`);
    console.log('[DB] words table created');

    console.log('[DB] Creating error_words table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL,
        user_id INTEGER,
        error_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
      )
    `);

    console.log('[DB] Creating observation_words table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS observation_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL,
        user_id INTEGER,
        correct_count INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
      )
    `);

    console.log('[DB] Creating import_files table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_import_user ON import_files(user_id)`);

    console.log('[DB] Creating settings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, key)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id)`);
    
    await pool.query(`ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS user_id INTEGER`);
    await pool.query(`ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    console.log('[DB] Creating practice_sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status TEXT DEFAULT 'active'
      )
    `);

    console.log('[DB] Creating word_relations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS word_relations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        root_word_id INTEGER NOT NULL,
        child_word_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (root_word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY (child_word_id) REFERENCES words(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_relations_root ON word_relations(root_word_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_relations_child ON word_relations(child_word_id)`);

    console.log('[DB] Creating classification_rules table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS classification_rules (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        suffix TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rules_user ON classification_rules(user_id)`);
    
    await pool.query(`ALTER TABLE IF EXISTS classification_rules ADD COLUMN IF NOT EXISTS user_id INTEGER`);
    await pool.query(`ALTER TABLE IF EXISTS classification_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    console.log('[DB] Creating import_error_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_error_logs (
        id SERIAL PRIMARY KEY,
        import_file_id INTEGER NOT NULL,
        index_number INTEGER NOT NULL,
        english TEXT,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (import_file_id) REFERENCES import_files(id) ON DELETE CASCADE
      )
    `);

    console.log('[DB] Creating parts_of_speech table...');
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

    console.log('[DB] Inserting default classification rules...');
    await pool.query(`
      INSERT INTO classification_rules (user_id, suffix, description, priority, active) VALUES
        (NULL, 'tion', '名词后缀', 10, 1),
        (NULL, 'ation', '名词后缀', 10, 1),
        (NULL, 'al', '形容词后缀', 9, 1),
        (NULL, 'ly', '副词后缀', 8, 1),
        (NULL, 'er', '名词后缀(人/物)', 7, 1),
        (NULL, 'or', '名词后缀(人/物)', 7, 1),
        (NULL, 'ing', '动名词/形容词', 6, 1),
        (NULL, 'ed', '过去式/分词', 6, 1),
        (NULL, 'ness', '名词后缀', 5, 1),
        (NULL, 'ment', '名词后缀', 5, 1),
        (NULL, 'able', '形容词后缀', 4, 1),
        (NULL, 'ible', '形容词后缀', 4, 1),
        (NULL, 'ful', '形容词后缀', 3, 1),
        (NULL, 'less', '形容词后缀', 3, 1),
        (NULL, 'ity', '名词后缀', 2, 1),
        (NULL, 'ize', '动词后缀', 2, 1),
        (NULL, 'ise', '动词后缀', 2, 1),
        (NULL, 'ous', '形容词后缀', 1, 1),
        (NULL, 'ive', '形容词后缀', 1, 1),
        (NULL, 'un', '否定前缀', 0, 1),
        (NULL, 're', '重复前缀', 0, 1),
        (NULL, 'pre', '前前缀', 0, 1),
        (NULL, 'dis', '否定前缀', 0, 1)
      ON CONFLICT DO NOTHING
    `);

    console.log('[DB] Inserting default parts of speech...');
    await pool.query(`
      INSERT INTO parts_of_speech (code, name, description) VALUES
        ('n.', '名词', '表示人，事、物、地点或抽象概念'),
        ('v.', '动词', '表示动作、状态或发生的事情'),
        ('adj.', '形容词', '描述或修饰名词'),
        ('adv.', '副词', '修饰动词、形容词或其他副词'),
        ('prep.', '介词', '表示时间、地点、方向等关系'),
        ('conj.', '连词', '连接单词、短语或句子'),
        ('pron.', '代词', '代替名词或名词短语'),
        ('num.', '数词', '表示数量或顺序'),
        ('art.', '冠词', '限定名词'),
        ('interj.', '感叹词', '表达强烈情感'),
        ('suff.', '后缀', '单词后缀'),
        ('comb.', '组合形式', '用于构成复合词'),
        ('abbr.', '缩写', '缩写形式'),
        ('pl.', '复数', '复数形式'),
        ('sing.', '单数', '单数形式')
      ON CONFLICT DO NOTHING
    `);

    console.log('[DB] Database initialized successfully');
  } catch (error) {
    console.error('[DB] Initialization error:', error);
    throw error;
  }
}

export async function run(query: string, params?: any[]): Promise<QueryResult<any>> {
  return pool.query(query, params);
}

export async function all(query: string, params?: any[]): Promise<any[]> {
  const result = await pool.query(query, params);
  return result.rows;
}

export async function get(query: string, params?: any[]): Promise<any | undefined> {
  const result = await pool.query(query, params);
  return result.rows[0];
}

export async function batchRun(queries: string[]): Promise<void> {
  for (const query of queries) {
    await pool.query(query);
  }
}

export async function saveDb(): Promise<void> {
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function withClient<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function batchInsert(table: string, columns: string[], values: any[][]): Promise<void> {
  if (values.length === 0) return;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const batchSize = 100;
    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map((_, rowIndex) => 
        `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
      ).join(', ');
      
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
      const params = batch.flat();
      
      await client.query(sql, params);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function batchUpdate(table: string, setClause: string, idField: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await run(`UPDATE ${table} SET ${setClause} WHERE ${idField} IN (${placeholders})`, ids);
}

export async function batchDelete(table: string, idField: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await run(`DELETE FROM ${table} WHERE ${idField} IN (${placeholders})`, ids);
}

export async function checkExisting(
  table: string, 
  conditions: { field: string; values: any[] }[],
  idField: string = 'id'
): Promise<Set<any>> {
  if (conditions.length === 0 || conditions.every(c => c.values.length === 0)) {
    return new Set();
  }
  
  const conditionClauses = conditions.map((cond, idx) => {
    const placeholders = cond.values.map((_, i) => `$${idx * 1000 + i + 1}`).join(',');
    return `${cond.field} IN (${placeholders})`;
  });
  
  const params = conditions.flatMap(c => c.values);
  const results = await all(`SELECT ${idField} FROM ${table} WHERE ${conditionClauses.join(' AND ')}`, params);
  
  return new Set(results.map(r => r[idField]));
}
