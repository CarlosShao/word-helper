-- Word Helper 数据库初始化脚本
-- 在 Supabase SQL Editor 中运行这个脚本

-- 1. 创建 words 表
CREATE TABLE IF NOT EXISTS words (
    id SERIAL PRIMARY KEY,
    english TEXT NOT NULL,
    part_of_speech TEXT,
    chinese TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_classified INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_words_english ON words(english);
CREATE INDEX IF NOT EXISTS idx_words_chinese ON words(chinese);

-- 2. 创建 users 表 (新增)
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
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- 3. 创建 user_sessions 表 (新增)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- 4. 创建 password_resets 表 (新增)
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- 5. 创建 error_words 表
CREATE TABLE IF NOT EXISTS error_words (
    id SERIAL PRIMARY KEY,
    word_id INTEGER NOT NULL,
    user_id INTEGER,
    error_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. 创建 observation_words 表
CREATE TABLE IF NOT EXISTS observation_words (
    id SERIAL PRIMARY KEY,
    word_id INTEGER NOT NULL,
    user_id INTEGER,
    correct_count INTEGER DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. 创建 import_files 表
CREATE TABLE IF NOT EXISTS import_files (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. 创建 settings 表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 9. 创建 practice_sessions 表
CREATE TABLE IF NOT EXISTS practice_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. 创建 word_relations 表
CREATE TABLE IF NOT EXISTS word_relations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    root_word_id INTEGER NOT NULL,
    child_word_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (root_word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (child_word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_relations_root ON word_relations(root_word_id);
CREATE INDEX IF NOT EXISTS idx_relations_child ON word_relations(child_word_id);

-- 11. 创建 classification_rules 表
CREATE TABLE IF NOT EXISTS classification_rules (
    id SERIAL PRIMARY KEY,
    suffix TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

-- 12. 创建 import_error_logs 表
CREATE TABLE IF NOT EXISTS import_error_logs (
    id SERIAL PRIMARY KEY,
    import_file_id INTEGER NOT NULL,
    index_number INTEGER NOT NULL,
    english TEXT,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_file_id) REFERENCES import_files(id) ON DELETE CASCADE
);

-- 13. 创建 parts_of_speech 表
CREATE TABLE IF NOT EXISTS parts_of_speech (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认的分类规则
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
ON CONFLICT DO NOTHING;

-- 插入默认的词性
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
ON CONFLICT DO NOTHING;

-- 检查初始化结果
SELECT
    (SELECT COUNT(*) FROM words) as words_count,
    (SELECT COUNT(*) FROM users) as users_count,
    (SELECT COUNT(*) FROM classification_rules) as rules_count,
    (SELECT COUNT(*) FROM parts_of_speech) as pos_count;

-- 提示信息
DO $$
BEGIN
    RAISE NOTICE '数据库初始化完成！';
END $$;
