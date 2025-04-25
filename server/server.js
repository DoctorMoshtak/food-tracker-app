const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const DB_PATH = path.join(__dirname, 'database.json');
let db = JSON.parse(fs.readFileSync(DB_PATH));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Basic cookie parser
function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    list[key] = decodeURIComponent(rest.join('='));
  });
  return list;
}

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Hash password with salt
function hashPassword(pw, salt) {
  return crypto.createHmac('sha256', salt).update(pw).digest('hex');
}

// Auth middleware
function auth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const userId = cookies.userId;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

// Sign up
app.post('/api/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (db.users.some(u => u.email === email))
    return res.status(400).json({ error: 'Email exists' });

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  db.users.push({ id, email, salt, hash });
  saveDB();
  res.json({ message: 'User created' });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const hash = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(400).json({ error: 'Invalid credentials' });

  // Set HTTP-only cookie
  res.setHeader('Set-Cookie', `userId=${user.id}; HttpOnly`);
  res.json({ message: 'Logged in' });
});

// Add meal entry
app.post('/api/meals', auth, (req, res) => {
  const { name, calories, comments, presetId } = req.body;
  if (!name || !calories)
    return res.status(400).json({ error: 'Missing fields' });

  const entry = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    name,
    calories: Number(calories),
    comments: comments || '',
    presetId: presetId || null,
    timestamp: Date.now()
  };
  db.meals.push(entry);
  saveDB();
  res.json(entry);
});

// Get meals for user
app.get('/api/meals', auth, (req, res) => {
  const meals = db.meals.filter(m => m.userId === req.user.id);
  res.json(meals);
});

// Preset foods CRUD
app.get('/api/presets', auth, (req, res) => {
  const presets = db.presets.filter(p => p.userId === req.user.id);
  res.json(presets);
});

app.post('/api/presets', auth, (req, res) => {
  const { name, calories } = req.body;
  if (!name || !calories)
    return res.status(400).json({ error: 'Missing fields' });

  const preset = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    name,
    calories: Number(calories)
  };
  db.presets.push(preset);
  saveDB();
  res.json(preset);
});

app.delete('/api/presets/:id', auth, (req, res) => {
  db.presets = db.presets.filter(
    p => !(p.id === req.params.id && p.userId === req.user.id)
  );
  saveDB();
  res.json({ message: 'Deleted' });
});

// Analytics endpoint
app.get('/api/stats', auth, (req, res) => {
  const meals = db.meals.filter(m => m.userId === req.user.id);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = oneDay * 7;
  const oneMonth = oneDay * 30;
  let daily = 0, weekly = 0, monthly = 0;

  meals.forEach(m => {
    const diff = now - m.timestamp;
    if (diff <= oneDay) daily += m.calories;
    if (diff <= oneWeek) weekly += m.calories;
    if (diff <= oneMonth) monthly += m.calories;
  });

  res.json({
    daily,
    weekly,
    monthly,
    avg7: (weekly / 7).toFixed(1),
    avg30: (monthly / 30).toFixed(1)
  });
});

// Start server
app.listen(3000, () => console.log('Server listening on http://localhost:3000'));