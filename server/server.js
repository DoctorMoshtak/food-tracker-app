const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const DB_PATH = path.join(__dirname, 'database.json');
let db = JSON.parse(fs.readFileSync(DB_PATH));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
// PUT /api/presets/:id — edit name, calories, items[]
app.put('/api/presets/:id', auth, (req, res) => {
  const { name, calories, items } = req.body;
  if (!name || calories == null || !Array.isArray(items)) {
    return res.status(400).json({ error: 'name, calories, items[] required' });
  }
  const preset = db.presets.find(p => p.id === req.params.id && p.userId === req.user.id);
  if (!preset) return res.status(404).json({ error: 'Preset not found' });

  preset.name     = name;
  preset.calories = Number(calories);
  preset.items    = items;
  saveDB();
  res.json(preset);
});
// GET /api/me — return current user’s profile
app.get('/api/me', auth, (req, res) => {
  const { id, name, email } = req.user;
  res.json({ id, name, email });
});

// PUT /api/me — update name & email
app.put('/api/me', auth, (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  req.user.name  = name;
  req.user.email = email;
  saveDB();
  res.json({ message: 'Profile updated' });
});

// PUT /api/me/password — change password
app.put('/api/me/password', auth, (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Current and new password required' });
  // verify current
  const hash = hashPassword(current, req.user.salt);
  if (hash !== req.user.hash) return res.status(400).json({ error: 'Invalid current password' });
  // set new
  const newSalt = crypto.randomBytes(16).toString('hex');
  req.user.salt = newSalt;
  req.user.hash = hashPassword(next, newSalt);
  saveDB();
  res.json({ message: 'Password changed' });
});
// GET all food items
app.get('/api/food-items', auth, (req, res) => {
  const items = db.foodItems || [];
  res.json(items);
});

// POST a new food item
app.post('/api/food-items', auth, (req, res) => {
  const { name, calories } = req.body;
  if (!name || calories == null) return res.status(400).json({ error: 'Name and calories required' });

  // Case-insensitive de-dup: check existing
  const existing = (db.foodItems||[]).find(i => i.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.status(400).json({ error: 'Item already exists' });

  const item = { id: crypto.randomUUID(), name, calories: Number(calories) };
  db.foodItems = db.foodItems||[];
  db.foodItems.push(item);
  saveDB();
  res.json(item);
});

// PUT update an item
app.put('/api/food-items/:id', auth, (req, res) => {
  const { name, calories } = req.body;
  if (!name || calories == null) return res.status(400).json({ error: 'Name and calories required' });

  const item = (db.foodItems||[]).find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  item.name     = name;
  item.calories = Number(calories);
  saveDB();
  res.json(item);
});

// DELETE an item
app.delete('/api/food-items/:id', auth, (req, res) => {
  db.foodItems = (db.foodItems||[]).filter(i => i.id !== req.params.id);
  saveDB();
  res.json({ message: 'Deleted' });
});

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function hashPassword(pw, salt) {
  return crypto.createHmac('sha256', salt).update(pw).digest('hex');
}

function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    list[key] = decodeURIComponent(rest.join('='));
  });
  return list;
}

function auth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const userId = cookies.userId;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

// Signup
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Check for existing user
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already in use' });
  }

  // Generate user ID, salt, and hashed password
  const id   = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  // Save user
  const user = { id, name, email, salt, hash };
  db.users.push(user);
  saveDB();

  // Auto-login by setting cookie
  res.setHeader('Set-Cookie', `userId=${id}; HttpOnly; Path=/`);
  res.json({ message: 'Signed up and logged in', id });
});


// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const hash = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(400).json({ error: 'Invalid credentials' });
  res.setHeader('Set-Cookie', `userId=${user.id}; HttpOnly; Path=/`);
  res.json({ message: 'Logged in' });
});

// Meals CRUD (accepts optional clientTime)
app.post('/api/meals', auth, (req, res) => {
  const { name, calories, comments, presetId, clientTime } = req.body;
  if (!name || !calories) return res.status(400).json({ error: 'Missing fields' });
  // Determine timestamp: use clientTime or now
  let timestamp = Date.now();
  if (clientTime) {
    // clientTime is ISO string
    timestamp = new Date(clientTime).getTime();
  }
  const entry = { id: crypto.randomUUID(), userId: req.user.id, name, calories: Number(calories), comments: comments||'', presetId: presetId||null, timestamp };
  db.meals.push(entry);
  saveDB();
  res.json(entry);
});

app.get('/api/meals', auth, (req, res) => {
  const meals = db.meals.filter(m => m.userId === req.user.id);
  res.json(meals);
});
// Update an existing meal
app.put('/api/meals/:id', auth, (req, res) => {
  const { name, calories, comments, clientTime } = req.body;
  const meal = db.meals.find(m => m.id === req.params.id && m.userId === req.user.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  if (name != null)      meal.name      = name;
  if (calories != null)  meal.calories  = Number(calories);
  if (comments != null)  meal.comments  = comments;
  if (clientTime)        meal.timestamp = new Date(clientTime).getTime();

  saveDB();
  res.json(meal);
});

// Delete a meal
app.delete('/api/meals/:id', auth, (req, res) => {
  const before = db.meals.length;
  db.meals = db.meals.filter(m => !(m.id === req.params.id && m.userId === req.user.id));
  saveDB();
  if (db.meals.length === before) return res.status(404).json({ error: 'Meal not found' });
  res.json({ message: 'Deleted' });
});

// Presets CRUD
app.get('/api/presets', auth, (req, res) => {
  res.json(db.presets.filter(p => p.userId === req.user.id));
});
// Create a new preset (with full items array)
app.post('/api/presets', auth, (req, res) => {
  const { name, calories, items } = req.body;
  if (!name || calories == null || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing fields: name, calories, and items[] are required' });
  }

  const preset = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    name,
    calories: Number(calories),
    items    // store the array of { n: itemName, c: calories }
  };

  db.presets.push(preset);
  saveDB();
  res.json(preset);
});

app.delete('/api/presets/:id', auth, (req, res) => {
  db.presets = db.presets.filter(p => !(p.id===req.params.id && p.userId===req.user.id));
  saveDB();
  res.json({ message: 'Deleted' });
});

// Stats
app.get('/api/stats', auth, (req, res) => {
  const now = Date.now();
  const oneDay=24*60*60*1000, oneWeek=oneDay*7, oneMonth=oneDay*30;
  const meals = db.meals.filter(m=>m.userId===req.user.id);
  let daily=0, weekly=0, monthly=0;
  meals.forEach(m=>{const diff=now-m.timestamp;if(diff<=oneDay)daily+=m.calories;if(diff<=oneWeek)weekly+=m.calories;if(diff<=oneMonth)monthly+=m.calories;});
  res.json({ daily, weekly, monthly, avg7:(weekly/7).toFixed(1), avg30:(monthly/30).toFixed(1) });
});

// ─── Settings ────────────────────────────────────────────────────────
// GET current user’s settings (with sensible defaults)
app.get('/api/settings', auth, (req, res) => {
  const s = db.settings.find(s => s.userId === req.user.id);
  // default reminderInterval=4h, calorieGoal=0
  res.json(s || { reminderInterval: 4, calorieGoal: 0 });
});

// POST updates to settings (reminderInterval and/or calorieGoal)
app.post('/api/settings', auth, (req, res) => {
  const { reminderInterval, calorieGoal } = req.body;
  let s = db.settings.find(s => s.userId === req.user.id);

  if (!s) {
    // first time for this user: create a new settings entry
    s = {
      userId: req.user.id,
      reminderInterval: Number(reminderInterval) || 4,
      calorieGoal:      Number(calorieGoal)      || 0
    };
    db.settings.push(s);
  } else {
    // update only the provided fields
    if (reminderInterval != null) s.reminderInterval = Number(reminderInterval);
    if (calorieGoal      != null) s.calorieGoal      = Number(calorieGoal);
  }

  saveDB();
  res.json(s);
});


// Dynamic port
const port = process.env.PORT||3000;
app.listen(port,()=>console.log(`Server on port ${port}`));