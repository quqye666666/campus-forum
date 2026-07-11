const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'forum.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT DEFAULT 'default',
    school TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '📌',
    description TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    section_id INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (section_id) REFERENCES sections(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS saved_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS blocked_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id),
    FOREIGN KEY (blocked_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS groups_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups_chat(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER,
    group_id INTEGER,
    content TEXT DEFAULT '',
    file_url TEXT DEFAULT '',
    file_type TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    FOREIGN KEY (group_id) REFERENCES groups_chat(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    option_index INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userColumns.includes('birthday')) {
  db.exec('ALTER TABLE users ADD COLUMN birthday TEXT DEFAULT ""');
}
if (!userColumns.includes('gender')) {
  db.exec('ALTER TABLE users ADD COLUMN gender TEXT DEFAULT ""');
}
if (!userColumns.includes('grade')) {
  db.exec('ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ""');
}
if (!userColumns.includes('avatar_url')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ""');
}
if (!userColumns.includes('signature')) {
  db.exec('ALTER TABLE users ADD COLUMN signature TEXT DEFAULT ""');
}
if (!userColumns.includes('last_active')) {
  db.exec('ALTER TABLE users ADD COLUMN last_active DATETIME');
}

const postColumns = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
if (!postColumns.includes('media_type')) {
  db.exec('ALTER TABLE posts ADD COLUMN media_type TEXT DEFAULT ""');
}

const msgColumns = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
if (!msgColumns.includes('is_read')) {
  db.exec('ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0');
}

const defaultSections = [
  { name: '校园动态', icon: '🏫', description: '校园热门动态' },
  { name: '学习交流', icon: '📚', description: '课程讨论、学习心得' },
  { name: '生活趣事', icon: '🎉', description: '分享校园生活' },
  { name: '活动通知', icon: '📢', description: '社团活动、讲座通知' },
  { name: '表白墙', icon: '💌', description: '匿名表白、悄悄话' },
  { name: '求职实习', icon: '💼', description: '实习招聘信息' },
  { name: '技术讨论', icon: '💻', description: '编程技术交流' },
];

const insertSection = db.prepare('INSERT OR IGNORE INTO sections (name, icon, description) VALUES (?, ?, ?)');
for (const s of defaultSections) {
  insertSection.run(s.name, s.icon, s.description);
}

module.exports = db;
