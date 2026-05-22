"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPool = createPool;
exports.initDb = initDb;
exports.run = run;
exports.all = all;
exports.get = get;
exports.batchRun = batchRun;
exports.saveDb = saveDb;
exports.closePool = closePool;
exports.withClient = withClient;
exports.batchInsert = batchInsert;
exports.batchUpdate = batchUpdate;
exports.batchDelete = batchDelete;
exports.checkExisting = checkExisting;
const pg_1 = require("pg");
const promises_1 = __importDefault(require("dns/promises"));
let pool;
let dbHostIPv4 = process.env.DB_HOST_IPV4 || null;
async function resolveIPv4(host) {
    if (dbHostIPv4) {
        console.log(`[DB] Using configured IPv4: ${dbHostIPv4}`);
        return dbHostIPv4;
    }
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return host;
    }
    try {
        const records = await promises_1.default.resolve4(host);
        if (records.length > 0) {
            console.log(`[DB] Resolved IPv4 for ${host}: ${records[0]}`);
            return records[0];
        }
    }
    catch (error) {
        console.warn(`[DB] Failed to resolve IPv4 for ${host}, using original: ${error}`);
    }
    return host;
}
async function createPool() {
    const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres.gqtsxcypwgtczlugkqsb:!henji2168Carlos@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const resolvedHost = await resolveIPv4(host);
    pool = new pg_1.Pool({
        host: resolvedHost,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    });
    console.log(`[DB] Connecting to PostgreSQL: ${url.username}@${resolvedHost}:${url.port}${url.pathname}`);
}
async function initDb() {
    await createPool();
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
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS observation_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL,
        correct_count INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
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
        FOREIGN KEY (root_word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY (child_word_id) REFERENCES words(id) ON DELETE CASCADE
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
        FOREIGN KEY (import_file_id) REFERENCES import_files(id) ON DELETE CASCADE
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
        await pool.query(`
      INSERT INTO classification_rules (suffix, description, priority, active) VALUES
        ('tion', '名词后缀', 10, 1),
        ('ation', '名词后缀', 10, 1),
        ('al', '形容词后缀', 9, 1),
        ('ly', '副词后缀', 8, 1),
        ('er', '名词后缀(人/物)', 7, 1),
        ('or', '名词后缀(人/物)', 7, 1),
        ('ing', '动名词/形容词', 6, 1),
        ('ed', '过去式/分词', 6, 1),
        ('ness', '名词后缀', 5, 1),
        ('ment', '名词后缀', 5, 1),
        ('able', '形容词后缀', 4, 1),
        ('ible', '形容词后缀', 4, 1),
        ('ful', '形容词后缀', 3, 1),
        ('less', '形容词后缀', 3, 1),
        ('ity', '名词后缀', 2, 1),
        ('ize', '动词后缀', 2, 1),
        ('ise', '动词后缀', 2, 1),
        ('ous', '形容词后缀', 1, 1),
        ('ive', '形容词后缀', 1, 1),
        ('un', '否定前缀', 0, 1),
        ('re', '重复前缀', 0, 1),
        ('pre', '前前缀', 0, 1),
        ('dis', '否定前缀', 0, 1)
      ON CONFLICT DO NOTHING
    `);
        await pool.query(`
      INSERT INTO parts_of_speech (code, name, description) VALUES
        ('n.', '名词', '表示人、事、物、地点或抽象概念'),
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
    }
    catch (error) {
        console.error('[DB] Initialization error:', error);
        throw error;
    }
}
async function run(query, params) {
    await pool.query(query, params);
}
async function all(query, params) {
    const result = await pool.query(query, params);
    return result.rows;
}
async function get(query, params) {
    const result = await pool.query(query, params);
    return result.rows[0];
}
async function batchRun(queries) {
    for (const query of queries) {
        await pool.query(query);
    }
}
async function saveDb() {
}
async function closePool() {
    await pool.end();
}
async function withClient(callback) {
    const client = await pool.connect();
    try {
        return await callback(client);
    }
    finally {
        client.release();
    }
}
async function batchInsert(table, columns, values) {
    if (values.length === 0)
        return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const batchSize = 100;
        for (let i = 0; i < values.length; i += batchSize) {
            const batch = values.slice(i, i + batchSize);
            const placeholders = batch.map((_, rowIndex) => `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`).join(', ');
            const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
            const params = batch.flat();
            await client.query(sql, params);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
async function batchUpdate(table, setClause, idField, ids) {
    if (ids.length === 0)
        return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await run(`UPDATE ${table} SET ${setClause} WHERE ${idField} IN (${placeholders})`, ids);
}
async function batchDelete(table, idField, ids) {
    if (ids.length === 0)
        return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await run(`DELETE FROM ${table} WHERE ${idField} IN (${placeholders})`, ids);
}
async function checkExisting(table, conditions, idField = 'id') {
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
