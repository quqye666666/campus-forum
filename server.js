// campus-forum server entry
process.on('uncaughtException', (err) => {
  console.error('FATAL uncaughtException:', err.stack || err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('FATAL unhandledRejection:', reason);
  process.exit(1);
});

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db;
try {
  db = require('./database');
  console.log('Database initialized OK');
} catch (e) {
  console.error('Database init FAILED:', e.stack || e.message);
  process.exit(1);
}

const baseDir = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(baseDir, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'campus-forum-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  if (req.session.userId) {
    db.prepare("UPDATE users SET last_active = datetime('now') WHERE id = ?").run(req.session.userId);
  }
  next();
});

app.get('/health', (req, res) => res.send('OK'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: function(res) { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); }
}));
app.use('/uploads', express.static(path.join(baseDir, 'public', 'uploads')));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

app.get('/api/online', (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as n FROM users WHERE last_active > datetime('now', '-5 minutes')").get();
  res.json({ online: count.n });
});

// ========== 用户相关 API ==========

function nameValid(name) {
  return typeof name === 'string' && /^[\u4e00-\u9fa5a-zA-Z]{2,20}$/.test(name);
}

/* ========== 图形验证码（人机验证） ========== */
function rndColor(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function randomCaptchaText(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function makeCaptchaSVG(text) {
  const w = 120, h = 40;
  let noise = '';
  for (let i = 0; i < 4; i++) {
    const x1 = (Math.random() * w).toFixed(1), y1 = (Math.random() * h).toFixed(1);
    const x2 = (Math.random() * w).toFixed(1), y2 = (Math.random() * h).toFixed(1);
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgb(${rndColor(0,255)},${rndColor(0,255)},${rndColor(0,255)})" stroke-width="1" opacity="0.5"/>`;
  }
  for (let i = 0; i < 24; i++) {
    noise += `<circle cx="${(Math.random() * w).toFixed(1)}" cy="${(Math.random() * h).toFixed(1)}" r="1" fill="rgb(${rndColor(0,255)},${rndColor(0,255)},${rndColor(0,255)})" opacity="0.5"/>`;
  }
  let chars = '';
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const x = (12 + i * (w - 20) / n + (Math.random() * 6 - 3)).toFixed(1);
    const y = (28 + (Math.random() * 6 - 3)).toFixed(1);
    const size = (22 + Math.random() * 8).toFixed(1);
    const rot = (Math.random() * 40 - 20).toFixed(1);
    const c = `rgb(${rndColor(0,160)},${rndColor(0,160)},${rndColor(0,160)})`;
    chars += `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" font-family="Arial" font-weight="bold" transform="rotate(${rot} ${x} ${y})">${text[i]}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f2f2f7"/>${noise}${chars}</svg>`;
}

app.get('/api/captcha', (req, res) => {
  const type = req.query.type === 'register' ? 'register' : 'login';
  const text = randomCaptchaText(4);
  req.session['captcha_' + type] = text.toLowerCase();
  res.type('image/svg+xml').send(makeCaptchaSVG(text));
});

app.post('/api/register', (req, res) => {
  const { name, password, captcha } = req.body;
  if (!req.session.captcha_register || req.session.captcha_register !== (captcha || '').toLowerCase()) {
    return res.status(400).json({ error: '图形验证码错误' });
  }
  req.session.captcha_register = null;
  if (!nameValid(name)) return res.status(400).json({ error: '用户名须为2-20位中英文，不能含数字或特殊符号' });
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(name)) {
    return res.status(400).json({ error: '该用户名已被占用' });
  }
  try {
    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, nickname, email) VALUES (?, ?, ?, NULL)').run(name, hashed, name);
    req.session.userId = result.lastInsertRowid;
    res.json({ id: result.lastInsertRowid, username: name, nickname: name, avatar: 'default' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '该用户名已被占用' });
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/login', (req, res) => {
  const { name, password, captcha } = req.body;
  if (!req.session.captcha_login || req.session.captcha_login !== (captcha || '').toLowerCase()) {
    return res.status(400).json({ error: '图形验证码错误' });
  }
  req.session.captcha_login = null;
  if (!name || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
  if (!user) return res.status(400).json({ error: '该用户不存在' });
  if (!user.password || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: '密码错误' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, school: user.school, bio: user.bio });
});

app.put('/api/user/password', requireAuth, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.session.userId);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/user/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db.prepare('SELECT id, username, nickname, avatar, school, bio, birthday, gender, grade, avatar_url, signature, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (user) user.zodiac = getZodiac(user.birthday);
  res.json(user || null);
});

app.get('/api/user/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, school, bio, birthday, gender, grade, avatar_url, signature, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(req.params.id).count;
  user.zodiac = getZodiac(user.birthday);
  res.json({ ...user, postCount });
});

app.put('/api/user/profile', requireAuth, (req, res) => {
  const { nickname, school, bio, birthday, gender, grade, signature } = req.body;
  db.prepare('UPDATE users SET nickname = ?, school = ?, bio = ?, birthday = ?, gender = ?, grade = ?, signature = ? WHERE id = ?').run(
    nickname, school, bio, birthday || '', gender || '', grade || '', signature || '', req.session.userId
  );
  res.json({ ok: true });
});

app.post('/api/user/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  const url = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.session.userId);
  res.json({ avatar_url: url });
});

function getZodiac(birthday) {
  if (!birthday) return '';
  var parts = birthday.split('-');
  var m = parseInt(parts[1]);
  var d = parseInt(parts[2]);
  var zodiacs = ['摩羯','水瓶','双鱼','白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手'];
  var cutoffs = [20,19,21,20,21,22,23,23,23,24,23,22];
  var idx = m - 1;
  if (d > cutoffs[idx]) idx = (idx + 1) % 12;
  return zodiacs[idx] + '座';
}

// ========== 分区 API ==========

app.get('/api/sections', (req, res) => {
  const sections = db.prepare(`
    SELECT s.*, COUNT(p.id) as post_count
    FROM sections s
    LEFT JOIN posts p ON s.id = p.section_id
    WHERE s.name NOT IN ('失物招领', '跳蚤市场')
    GROUP BY s.id
    ORDER BY s.id
  `).all();
  res.json(sections);
});

// 表白墙 section id lookup
function getConfessionSectionId() {
  const s = db.prepare("SELECT id FROM sections WHERE name = ?").get('表白墙');
  return s ? s.id : null;
}

// ========== 帖子 API ==========

app.get('/api/posts', (req, res) => {
  const { section_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let sql, params;
  if (section_id) {
    sql = `
      SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN sections s ON p.section_id = s.id
      WHERE p.section_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [section_id, Number(limit), offset];
  } else {
    sql = `
      SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN sections s ON p.section_id = s.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [Number(limit), offset];
  }

  const posts = db.prepare(sql).all(...params);

  if (req.session.userId) {
    for (const post of posts) {
      const liked = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.session.userId);
      post.is_liked = !!liked;
      const saved = db.prepare('SELECT 1 FROM saved_posts WHERE post_id = ? AND user_id = ?').get(post.id, req.session.userId);
      post.is_saved = !!saved;
    }
  }

  const confessionId = getConfessionSectionId();
  for (const post of posts) {
    if (post.section_id === confessionId) {
      post.nickname = '匿名';
      post.username = 'anonymous';
      post.avatar = 'default';
      post.is_anonymous = true;
    }
  }

  res.json(posts);
});

app.post('/api/posts', requireAuth, upload.array('images', 9), (req, res) => {
  const { content, section_id = 1 } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  const images = req.files && req.files.length ? req.files.map(f => '/uploads/' + f.filename).join(',') : '';
  const mime = req.files && req.files.length ? req.files[0].mimetype : '';
  var media_type = '';
  if (mime.startsWith('video/')) media_type = 'video';
  else if (mime.startsWith('image/')) media_type = 'image';
  else if (mime) media_type = 'file';
  const result = db.prepare('INSERT INTO posts (user_id, section_id, content, image, media_type) VALUES (?, ?, ?, ?, ?)').run(req.session.userId, section_id, content.trim(), images, media_type);
  const post = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
    FROM posts p
    JOIN users u ON p.user_id = u.id
    JOIN sections s ON p.section_id = s.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.json(post);
});

app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.username, u.school, s.name as section_name, s.icon as section_icon
    FROM posts p
    JOIN users u ON p.user_id = u.id
    JOIN sections s ON p.section_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const comments = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  if (req.session.userId) {
    const liked = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.session.userId);
    post.is_liked = !!liked;
    const saved = db.prepare('SELECT 1 FROM saved_posts WHERE post_id = ? AND user_id = ?').get(post.id, req.session.userId);
    post.is_saved = !!saved;
  }

  res.json({ ...post, comments });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: '帖子不存在或无权删除' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ========== 评论 API ==========

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '评论不能为空' });
  }
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const result = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, content.trim());
  db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(req.params.id);

  const comment = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.json(comment);
});

app.delete('/api/comments/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!comment) return res.status(404).json({ error: '评论不存在或无权删除' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE posts SET comments_count = MAX(0, comments_count - 1) WHERE id = ?').run(comment.post_id);
  res.json({ ok: true });
});

// ========== 点赞 API ==========

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = req.params.id;
  const existing = db.prepare('SELECT * FROM likes WHERE post_id = ? AND user_id = ?').get(postId, req.session.userId);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(postId);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(postId, req.session.userId);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
    res.json({ liked: true });
  }
});

// ========== 关注 API ==========

app.post('/api/follow/:userId', requireAuth, (req, res) => {
  if (Number(req.params.userId) === req.session.userId) {
    return res.status(400).json({ error: '不能关注自己' });
  }
  const existing = db.prepare('SELECT * FROM follows WHERE follower_id = ? AND following_id = ?').get(req.session.userId, req.params.userId);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.session.userId, req.params.userId);
    res.json({ following: true });
  }
});

app.get('/api/follow/:userId/status', requireAuth, (req, res) => {
  const f = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.session.userId, req.params.userId);
  res.json({ following: !!f });
});

// ========== 用户帖子列表 ==========

app.get('/api/user/:id/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
    FROM posts p
    JOIN users u ON p.user_id = u.id
    JOIN sections s ON p.section_id = s.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.params.id);
  res.json(posts);
});

// ========== 搜索帖子 ==========

app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  const keyword = `%${q.trim()}%`;
  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
    FROM posts p
    JOIN users u ON p.user_id = u.id
    JOIN sections s ON p.section_id = s.id
    WHERE p.content LIKE ?
    ORDER BY p.created_at DESC
    LIMIT 50
  `).all(keyword);
  res.json(posts);
});

// ========== 收藏 API ==========

app.post('/api/posts/:id/save', requireAuth, (req, res) => {
  const postId = req.params.id;
  const existing = db.prepare('SELECT * FROM saved_posts WHERE post_id = ? AND user_id = ?').get(postId, req.session.userId);
  if (existing) {
    db.prepare('DELETE FROM saved_posts WHERE id = ?').run(existing.id);
    res.json({ saved: false });
  } else {
    db.prepare('INSERT INTO saved_posts (post_id, user_id) VALUES (?, ?)').run(postId, req.session.userId);
    res.json({ saved: true });
  }
});

app.get('/api/posts/:id/saved', requireAuth, (req, res) => {
  const s = db.prepare('SELECT 1 FROM saved_posts WHERE post_id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  res.json({ saved: !!s });
});

app.get('/api/user/saved', requireAuth, (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.username, s.name as section_name, s.icon as section_icon
    FROM saved_posts sp
    JOIN posts p ON sp.post_id = p.id
    JOIN users u ON p.user_id = u.id
    JOIN sections s ON p.section_id = s.id
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(req.session.userId);
  res.json(posts);
});

// ========== 编辑帖子 ==========

app.put('/api/posts/:id', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: '帖子不存在或无权编辑' });
  db.prepare('UPDATE posts SET content = ? WHERE id = ?').run(content.trim(), req.params.id);
  res.json({ ok: true });
});

// ========== 拉黑 API ==========

app.post('/api/block/:userId', requireAuth, (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.session.userId) return res.status(400).json({ error: '不能拉黑自己' });
  const existing = db.prepare('SELECT * FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').get(req.session.userId, targetId);
  if (existing) {
    db.prepare('DELETE FROM blocked_users WHERE id = ?').run(existing.id);
    res.json({ blocked: false });
  } else {
    db.prepare('INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)').run(req.session.userId, targetId);
    res.json({ blocked: true });
  }
});

app.get('/api/blocked', requireAuth, (req, res) => {
  const blocked = db.prepare(`
    SELECT u.id, u.nickname, u.avatar_url FROM blocked_users b
    JOIN users u ON b.blocked_id = u.id WHERE b.blocker_id = ?
  `).all(req.session.userId);
  res.json(blocked);
});

app.get('/api/block/:userId/status', requireAuth, (req, res) => {
  const b = db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').get(req.session.userId, Number(req.params.userId));
  res.json({ blocked: !!b, isBlockedBy: false });
});

// 标记消息已读
app.put('/api/messages/read', requireAuth, (req, res) => {
  const { sender_id, group_id } = req.body;
  if (group_id) {
    db.prepare('UPDATE messages SET is_read = 1 WHERE group_id = ? AND sender_id != ? AND is_read = 0').run(group_id, req.session.userId);
  } else if (sender_id) {
    db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0').run(sender_id, req.session.userId);
  }
  res.json({ ok: true });
});

// ========== 私信 API ==========

app.post('/api/messages', requireAuth, upload.single('file'), (req, res) => {
  const { receiver_id, content = '', group_id } = req.body;

  if (receiver_id && Number(receiver_id) === req.session.userId) {
    return res.status(400).json({ error: '不能给自己发消息' });
  }

  // 检查是否被拉黑
  if (receiver_id) {
    const blocked = db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').get(Number(receiver_id), req.session.userId);
    if (blocked) return res.status(403).json({ error: '对方已将你拉黑' });
  }

  // 互关前只能发一条
  if (receiver_id && !content.trim() && !req.file) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  if (receiver_id) {
    const mutual = db.prepare(`
      SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?
    `).get(req.session.userId, Number(receiver_id));
    const reverse = db.prepare(`
      SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?
    `).get(Number(receiver_id), req.session.userId);
    if (!(mutual && reverse)) {
      const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE sender_id = ? AND receiver_id = ? AND group_id IS NULL').get(req.session.userId, Number(receiver_id)).c;
      if (msgCount >= 1) return res.status(403).json({ error: '互关前只能发送一条消息，请先互相关注' });
    }
  }

  var file_url = '', file_type = '', file_name = '';
  if (req.file) {
    file_url = '/uploads/' + req.file.filename;
    file_name = req.file.originalname;
    var m = req.file.mimetype;
    if (m.startsWith('image/')) file_type = 'image';
    else if (m.startsWith('video/')) file_type = 'video';
    else file_type = 'file';
  }

  var gid = group_id ? Number(group_id) : null;
  var rid = receiver_id ? Number(receiver_id) : null;

  const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, group_id, content, file_url, file_type, file_name) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    req.session.userId, rid, gid, content.trim(), file_url, file_type, file_name
  );

  const msg = db.prepare(`
    SELECT m.*, u.nickname as sender_nickname, u.avatar_url as sender_avatar
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).get(result.lastInsertRowid);
  res.json(msg);
});

app.get('/api/messages/:userId', requireAuth, (req, res) => {
  const msgs = db.prepare(`
    SELECT m.*, u.nickname as sender_nickname, u.avatar_url as sender_avatar
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.group_id IS NULL
      AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
    ORDER BY m.created_at ASC LIMIT 100
  `).all(req.session.userId, Number(req.params.userId), Number(req.params.userId), req.session.userId);
  res.json(msgs);
});

app.get('/api/conversations', requireAuth, (req, res) => {
  const convs = db.prepare(`
    SELECT DISTINCT u.id, u.nickname, u.avatar_url,
      (SELECT content FROM messages m2 WHERE ((m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id)) AND m2.group_id IS NULL ORDER BY m2.created_at DESC LIMIT 1) as last_msg,
      (SELECT created_at FROM messages m2 WHERE ((m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id)) AND m2.group_id IS NULL ORDER BY m2.created_at DESC LIMIT 1) as last_time
    FROM users u
    WHERE u.id IN (
      SELECT sender_id FROM messages WHERE receiver_id = ? AND group_id IS NULL
      UNION
      SELECT receiver_id FROM messages WHERE sender_id = ? AND group_id IS NULL
    )
    AND u.id != ?
    ORDER BY last_time DESC
  `).all(req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId);
  const groups = db.prepare(`
    SELECT g.id, g.name, g.created_at as last_time,
      (SELECT content FROM messages m2 WHERE m2.group_id = g.id ORDER BY m2.created_at DESC LIMIT 1) as last_msg
    FROM group_members gm JOIN groups_chat g ON gm.group_id = g.id WHERE gm.user_id = ?
    ORDER BY last_time DESC
  `).all(req.session.userId);
  res.json({ users: convs, groups: groups });
});

// ========== 群聊 API ==========

app.post('/api/groups', requireAuth, (req, res) => {
  const { name, member_ids } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '群名称不能为空' });
  const result = db.prepare('INSERT INTO groups_chat (name, creator_id) VALUES (?, ?)').run(name.trim(), req.session.userId);
  const gid = result.lastInsertRowid;
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(gid, req.session.userId);
  if (member_ids && member_ids.length) {
    const insert = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
    for (const uid of member_ids) insert.run(gid, uid);
  }
  res.json({ id: gid, name: name.trim() });
});

app.post('/api/groups/:id/members', requireAuth, (req, res) => {
  const { user_id } = req.body;
  const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!isMember) return res.status(403).json({ error: '你不是该群成员' });
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(req.params.id, user_id);
  res.json({ ok: true });
});

app.get('/api/groups/:id/messages', requireAuth, (req, res) => {
  const msgs = db.prepare(`
    SELECT m.*, u.nickname as sender_nickname, u.avatar_url as sender_avatar
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.group_id = ? ORDER BY m.created_at ASC LIMIT 200
  `).all(req.params.id);
  res.json(msgs);
});

app.get('/api/groups', requireAuth, (req, res) => {
  const groups = db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups_chat g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ?
  `).all(req.session.userId);
  res.json(groups);
});

// ========== 投票 API ==========

app.post('/api/polls', requireAuth, (req, res) => {
  const { question, options } = req.body;
  if (!question || !options || options.length < 2) {
    return res.status(400).json({ error: '请输入问题和至少2个选项' });
  }
  const result = db.prepare('INSERT INTO polls (creator_id, question, options) VALUES (?, ?, ?)').run(
    req.session.userId, question, JSON.stringify(options)
  );
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/polls', (req, res) => {
  const polls = db.prepare(`
    SELECT p.*, u.nickname FROM polls p JOIN users u ON p.creator_id = u.id
    ORDER BY p.created_at DESC LIMIT 30
  `).all();
  for (const poll of polls) {
    const options = JSON.parse(poll.options);
    const votes = options.map((opt, i) => {
      const c = db.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ? AND option_index = ?').get(poll.id, i);
      return { option: opt, count: c.n };
    });
    poll.options_with_votes = votes;
    poll.total_votes = votes.reduce((a, b) => a + b.count, 0);
    if (req.session.userId) {
      const myVote = db.prepare('SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(poll.id, req.session.userId);
      poll.my_vote = myVote ? myVote.option_index : null;
    }
  }
  res.json(polls);
});

app.post('/api/polls/:id/vote', requireAuth, (req, res) => {
  const { option_index } = req.body;
  if (option_index === undefined || option_index === null) {
    return res.status(400).json({ error: '请选择一个选项' });
  }
  const existing = db.prepare('SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (existing) {
    return res.status(400).json({ error: '你已经投过票了' });
  }
  db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, option_index);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

process.on('uncaughtException', (err) => {
  console.error('FATAL:', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('REJECTION:', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('SERVER STARTED OK - port=' + PORT + ' pid=' + process.pid);
}).on('error', (err) => {
  console.error('LISTEN ERROR:', err.message);
  process.exit(1);
});
