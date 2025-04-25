// Helper for API calls
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// Auth form handler (index.html)
const authForm = document.getElementById('auth-form');
if (authForm) {
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = authForm.email.value;
    const password = authForm.password.value;
    const action = authForm.dataset.action;
    const endpoint = action === 'signup' ? '/api/signup' : '/api/login';
    const result = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (result.error) alert(result.error);
    else window.location = 'dashboard.html';
  });
}

// Dashboard logic (dashboard.html)
if (document.getElementById('lastMealTimer')) {
  initDashboard();
}
async function initDashboard() {
  const meals = await api('/api/meals');
  // Last meal timer
  if (meals.length) {
    const last = meals[meals.length - 1];
    updateTimer(Date.now() - last.timestamp);
    setInterval(() => updateTimer(Date.now() - last.timestamp), 60000);
  } else {
    document.getElementById('lastMealTimer').innerText = 'No meals logged';
  }
  // Today's stats
  const today = new Date().toDateString();
  const todayMeals = meals.filter(m => new Date(m.timestamp).toDateString() === today);
  document.getElementById('todaysMeals').innerText = todayMeals.length;
  document.getElementById('todaysCalories').innerText =
    todayMeals.reduce((sum, m) => sum + m.calories, 0);
}
function updateTimer(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  document.getElementById('lastMealTimer').innerText = `${h}h ${m}m ago`;
}

// Add Meal page logic (add_meal.html)
const addForm = document.getElementById('add-meal-form');
if (addForm) {
  // Populate presets dropdown
  api('/api/presets').then(list => {
    const sel = document.getElementById('preset');
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      sel.append(opt);
    });
  });
  // Submit meal
  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      name: addForm.mealName.value,
      calories: addForm.calories.value,
      comments: addForm.comments.value,
      presetId: addForm.preset.value || null
    };
    const res = await api('/api/meals', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.error) alert(res.error);
    else window.location = 'dashboard.html';
  });
}

// Analytics page logic (analytics.html)
if (document.getElementById('statDaily')) {
  api('/api/stats').then(s => {
    document.getElementById('statDaily').innerText = s.daily;
    document.getElementById('statWeekly').innerText = s.weekly;
    document.getElementById('statMonthly').innerText = s.monthly;
    document.getElementById('statAvg7').innerText = s.avg7;
    document.getElementById('statAvg30').innerText = s.avg30;
  });
}