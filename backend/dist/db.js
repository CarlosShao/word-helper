"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = initDb;
exports.run = run;
exports.runInTransaction = runInTransaction;
exports.batchInsert = batchInsert;
exports.batchUpdate = batchUpdate;
exports.batchDelete = batchDelete;
exports.checkExisting = checkExisting;
exports.all = all;
exports.get = get;
exports.withClient = withClient;
exports.closeDb = closeDb;
const pg_1 = require("pg");
const dns_1 = __importDefault(require("dns"));
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
    return new Promise((resolve) => {
        dns_1.default.lookup(host, { family: 4 }, (err, address) => {
            if (err || !address) {
                console.warn(`[DB] Failed to resolve IPv4 for ${host}, using original hostname`);
                resolve(host);
            }
            else {
                console.log(`[DB] Resolved IPv4 for ${host}: ${address}`);
                resolve(address);
            }
        });
    });
}
async function initDb() {
    // 使用环境变量或者默认的 Supabase 连接字符串
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:!henji2168Carlos@db.gqtsxcypwgtczlugkqsb.supabase.co:5432/postgres';
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const resolvedHost = await resolveIPv4(host);
    console.log(`[DB] Using IPv4 address: ${resolvedHost}`);
    pool = new pg_1.Pool({
        host: resolvedHost,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        family: 4,
    });
    console.log(`[DB] Connecting to PostgreSQL: ${url.username}@${resolvedHost}:${url.port}${url.pathname}`);
    // 测试连接
    const client = await pool.connect();
    console.log('[DB] Database connected successfully');
    client.release();
    await initTables();
}
async function initTables() {
    const client = await pool.connect();
    try {
        await client.query(`
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
        await client.query(`CREATE INDEX IF NOT EXISTS idx_words_english ON words(english)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_words_chinese ON words(chinese)`);
        await client.query(`
      CREATE TABLE IF NOT EXISTS error_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL REFERENCES words(id),
        error_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS observation_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL REFERENCES words(id),
        correct_count INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS import_files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status TEXT DEFAULT 'active'
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS word_relations (
        id SERIAL PRIMARY KEY,
        root_word_id INTEGER NOT NULL REFERENCES words(id),
        child_word_id INTEGER NOT NULL REFERENCES words(id),
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_relations_root ON word_relations(root_word_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_relations_child ON word_relations(child_word_id)`);
        await client.query(`
      CREATE TABLE IF NOT EXISTS classification_rules (
        id SERIAL PRIMARY KEY,
        suffix TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS import_error_logs (
        id SERIAL PRIMARY KEY,
        import_file_id INTEGER NOT NULL REFERENCES import_files(id),
        index_number INTEGER NOT NULL,
        english TEXT,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS parts_of_speech (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        const rulesCheck = await client.query('SELECT COUNT(*) as count FROM classification_rules');
        if (parseInt(rulesCheck.rows[0].count) === 0) {
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
                await client.query('INSERT INTO classification_rules (suffix, description, priority, active) VALUES ($1, $2, $3, $4)', [rule.suffix, rule.description, rule.priority, 1]);
            }
        }
        console.log('[DB] Database initialized successfully');
    }
    finally {
        client.release();
    }
}
async function run(sql, params = []) {
    const client = await pool.connect();
    try {
        await client.query(sql, params);
    }
    finally {
        client.release();
    }
}
async function runInTransaction(operations) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const op of operations) {
            await client.query(op.sql, op.params || []);
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
async function all(sql, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows;
    }
    finally {
        client.release();
    }
}
async function get(sql, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows[0] || null;
    }
    finally {
        client.release();
    }
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
async function closeDb() {
    if (pool) {
        await pool.end();
        console.log('[DB] Database connection closed');
    }
}
