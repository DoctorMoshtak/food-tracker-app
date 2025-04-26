// public/script.js

document.addEventListener('DOMContentLoaded', () => {
  // ----------
  // API helper
  // ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    return res.json();
  }

  // ----------------
  // Global Navigation / Logout
  // ----------------
  window.goTo = page => {
    if (!page.startsWith('/')) page = '/' + page;
    window.location.href = page;
  };
  window.logout = () => {
    document.cookie = 'userId=; Max-Age=0; path=/';
    window.location.href = '/index.html';
  };

  // ----------------
  // Auth: Sign-up & Log-in
  // ----------------
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = signupForm.name.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;
      const res = await api('/api/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      const msg = document.getElementById('signup-message');
      if (res.error) {
        msg.style.color = 'crimson';
        msg.textContent = res.error;
      } else {
        msg.style.color = 'green';
        msg.textContent = 'Sign-up successful! Please log in.';
        signupForm.reset();
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;
      const res = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const msg = document.getElementById('login-message');
      if (res.error) {
        msg.style.color = 'crimson';
        msg.textContent = res.error;
      } else {
        window.location.href = '/dashboard.html';
      }
    });
  }

  // ----------------
  // Add Meal Combo Page
  // ----------------
  const addForm = document.getElementById('add-meal-form');
  if (addForm) {
    const presetSel = document.getElementById('preset-selector');
    const comboName = document.getElementById('combo-name');
    const itemsTbody = document.querySelector('#items-table tbody');
    const addRowBtn = document.getElementById('add-row');
    const totalCal = document.getElementById('total-cal');
    const dateInput = document.getElementById('mealDate');
    const timeInput = document.getElementById('mealTime');
    const nowBtn = document.getElementById('now-btn');

    // Load presets
    api('/api/presets').then(list => {
      list.forEach(p => {
        const o = document.createElement('option');
        o.value = JSON.stringify(p);
        o.textContent = p.name;
        presetSel.appendChild(o);
      });
    });

    // Initialize date/time
    dateInput.value = new Date().toISOString().split('T')[0];
    timeInput.value = new Date().toTimeString().slice(0,5);
    nowBtn.addEventListener('click', () => {
      timeInput.value = new Date().toTimeString().slice(0,5);
    });

    // Update total
    function updateTotal() {
      let sum = 0;
      itemsTbody.querySelectorAll('.item-cal').forEach(i => sum += Number(i.value) || 0);
      totalCal.textContent = sum;
      document.getElementById('btn-cal').textContent = sum;
    }

    // Current form data
    function currentFormData() {
      return Array.from(itemsTbody.querySelectorAll('tr')).map(row => ({
        name: row.querySelector('.item-name').value.trim(),
        cal: Number(row.querySelector('.item-cal').value) || 0
      }));
    }

    // Wire up existing rows
    itemsTbody.querySelectorAll('.item-cal').forEach(inp => inp.addEventListener('input', updateTotal));

    // Add new row
    addRowBtn.addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="item-name" type="text"></td>
        <td><input class="item-cal" type="number" min="0"></td>
        <td><button type="button" class="remove-row">–</button></td>`;
      itemsTbody.appendChild(tr);
      tr.querySelector('.item-cal').addEventListener('input', updateTotal);
      tr.querySelector('.remove-row').addEventListener('click', () => { tr.remove(); updateTotal(); });
    });

    // Preset autofill
    presetSel.addEventListener('change', () => {
      const val = presetSel.value;
      if (!val) { updateTotal(); return; }
      const p = JSON.parse(val);
      comboName.value = p.name;
      itemsTbody.innerHTML = '';
      p.items.forEach(it => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input class="item-name" type="text" value="${it.n}"></td>
          <td><input class="item-cal" type="number" min="0" value="${it.c}"></td>
          <td><button type="button" class="remove-row">–</button></td>`;
        itemsTbody.appendChild(tr);
        tr.querySelector('.item-cal').addEventListener('input', updateTotal);
        tr.querySelector('.remove-row').addEventListener('click', () => { tr.remove(); updateTotal(); });
      });
      updateTotal();
    });

    // Submit
    addForm.addEventListener('submit', async e => {
      e.preventDefault();
      const items = currentFormData();
      const nameVal = comboName.value.trim() || items.map(i=>i.name).join(', ');
      const calSum = items.reduce((a,b)=>a+b.cal,0);
      const clientTime = `${dateInput.value}T${timeInput.value}:00`;
      const payload = { name: nameVal, calories: calSum, comments: '', combo: items, clientTime };
      const res = await api('/api/meals', { method: 'POST', body: JSON.stringify(payload) });
      if (res.error) return alert(res.error);
      window.location.href = '/dashboard.html';
    });
  }

  // ----------------
  // Dashboard Page
  // ----------------
  const statsEl = document.getElementById('stats');
  if (statsEl) {
    Promise.all([ api('/api/meals'), api('/api/settings') ])
    .then(([meals, settings]) => {
      // Fasting
      const lastTs = meals.length ? Math.max(...meals.map(m=>m.timestamp)) : Date.now();
      const fastEl = document.getElementById('fastingTime');
      function tick() {
        const diff = Date.now() - lastTs;
        const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
        fastEl.textContent = `${h}h ${m}m ${s}s`;
      }
      tick(); setInterval(tick,1000);
      // Meals today
      const today = new Date().toDateString();
      const todays = meals.filter(m=>new Date(m.timestamp).toDateString()===today);
      document.getElementById('todaysMeals').textContent = todays.length;
      // Calories
      const calToday = todays.reduce((a,b)=>a+b.calories,0);
      const goal = settings.calorieGoal || 0;
      document.getElementById('todaysCalories').textContent = calToday;
      document.getElementById('dailyGoal').textContent = goal;
      document.getElementById('remainingCalc').textContent = goal - calToday;
      // Pills
      const pills = document.getElementById('mealPills');
      pills.innerHTML='';
      for(let i=0;i<8;i++){ const d=document.createElement('div'); d.className=i<todays.length?'pill filled':'pill'; pills.appendChild(d);}    
      // Ring
      const pct = goal? Math.min(calToday/goal,1.5):0;
      const dash = 339*(1-pct);
      const fg = document.querySelector('.ring-fg');
      fg.style.strokeDashoffset=dash;
      // colors...
    }).catch(console.error);
  }

  // ----------------
  // Recent Logs
  // ----------------
  const recBody = document.getElementById('recent-logs-body');
  if(recBody){ api('/api/meals').then(meals=>{
      meals.sort((a,b)=>b.timestamp-a.timestamp).slice(0,5).forEach(m=>{
        const dt=new Date(m.timestamp);
        const diff=Date.now()-m.timestamp;
        const h=Math.floor(diff/3600000), mm=Math.floor((diff%3600000)/60000);
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</td>
                      <td>${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                      <td>${h}h ${mm}m</td>
                      <td>${m.name}</td>
                      <td>${m.calories}</td>`;
        recBody.appendChild(tr);
      });
    }); }

  // ... (analytics, logs, presets, settings, food-items omitted for brevity) ...



  // -----------------
  // Analytics page
  // -----------------
  if (document.getElementById('statDaily')) {
    api('/api/stats').then(stats => {
      document.getElementById('statDaily').innerText   = stats.daily;
      document.getElementById('statWeekly').innerText  = stats.weekly;
      document.getElementById('statMonthly').innerText = stats.monthly;
      document.getElementById('statAvg7').innerText    = stats.avg7;
      document.getElementById('statAvg30').innerText   = stats.avg30;
    }).catch(console.error);
  }

  // -----------------
  // Dashboard: Recent Logs
  // -----------------
  if (document.getElementById('recent-logs-body')) {
    api('/api/meals').then(meals => {
      meals.sort((a,b)=>b.timestamp - a.timestamp);
      const recent = meals.slice(0,5);
      const tbody  = document.getElementById('recent-logs-body');
      tbody.innerHTML = '';
      recent.forEach(m => {
        const dt    = new Date(m.timestamp);
        const diff  = Date.now() - m.timestamp;
        const h     = Math.floor(diff/3600000);
        const mm    = Math.floor((diff%3600000)/60000);
        const tr    = document.createElement('tr');
        tr.innerHTML = `
          <td>${dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</td>
          <td>${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
          <td>${h}h ${mm}m </td>
          <td>${m.name}</td>
          <td>${m.calories}</td>`;
        tbody.append(tr);
      });
    });
  }

  // -----------------
  // Logs page (full CRUD + pagination)
  // -----------------
  const logsBody = document.getElementById('logs-body');
  if (logsBody) {
    const perPage  = 20;
    let   pageIndex = 0;
    let   allMeals  = [];

    const prevBtn  = document.getElementById('prev-page');
    const nextBtn  = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    function renderPage() {
      logsBody.innerHTML = '';
      const start     = pageIndex * perPage;
      const pageItems = allMeals.slice(start, start + perPage);

      pageItems.forEach(m => {
        const dt   = new Date(m.timestamp);
        const diff = Date.now() - m.timestamp;
        const h    = Math.floor(diff/3600000);
        const mm   = Math.floor((diff%3600000)/60000);

        const tr = document.createElement('tr');
        tr.dataset.id = m.id;
        tr.innerHTML = `
          <td data-label="Date">${dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</td>
          <td data-label="Time">${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
          <td data-label="Since">${h}h ${mm}m </td>
          <td data-label="Meal">${m.name}</td>
          <td data-label="Calories">${m.calories}</td>
          <td data-label="Actions">
            <button class="edit-meal">✏️</button>
            <button class="delete-meal">🗑️</button>
          </td>`;
        logsBody.append(tr);

        tr.querySelector('.delete-meal').onclick = async () => {
          if (!confirm('Delete this meal?')) return;
          await api(`/api/meals/${m.id}`, { method: 'DELETE' });
          allMeals = allMeals.filter(x => x.id !== m.id);
          renderPage();
        };
        tr.querySelector('.edit-meal').onclick = () => openEditModal(m);
      });

      const totalPages = Math.max(Math.ceil(allMeals.length / perPage), 1);
      pageInfo.innerText = `Page ${pageIndex+1} of ${totalPages}`;
      prevBtn.disabled = pageIndex === 0;
      nextBtn.disabled = pageIndex + 1 >= totalPages;
    }

    const modal    = document.getElementById('edit-meal-modal');
    const nameIn   = document.getElementById('modal-name');
    const calIn    = document.getElementById('modal-cal');
    const cmtIn    = document.getElementById('modal-cmt');
    const dtIn     = document.getElementById('modal-dt');
    const saveBtn  = document.getElementById('modal-save');
    const cancelBtn= document.getElementById('modal-cancel');
    let   editingId;

    function openEditModal(m) {
      editingId = m.id;
      nameIn.value = m.name;
      calIn.value  = m.calories;
      cmtIn.value  = m.comments || '';
      dtIn.value   = new Date(m.timestamp).toISOString().slice(0,16);
      modal.classList.remove('hidden');
    }
    cancelBtn.onclick = () => modal.classList.add('hidden');
    saveBtn.onclick   = async () => {
      const payload = {
        name:       nameIn.value,
        calories:   Number(calIn.value),
        comments:   cmtIn.value,
        clientTime: dtIn.value
      };
      await api(`/api/meals/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      modal.classList.add('hidden');
      allMeals = allMeals.map(x => x.id === editingId
        ? { ...x, ...payload, timestamp: new Date(payload.clientTime).getTime() }
        : x
      );
      renderPage();
    };

    prevBtn.onclick = () => { if (pageIndex > 0) { pageIndex--; renderPage(); } };
    nextBtn.onclick = () => { if ((pageIndex+1)*perPage < allMeals.length) { pageIndex++; renderPage(); } };

    api('/api/meals')
      .then(meals => { allMeals = meals.sort((a,b) => b.timestamp - a.timestamp); renderPage(); })
      .catch(console.error);
  }

  // -----------------
  // Presets page
  // -----------------
  const presetList = document.getElementById('preset-list');
  const newForm    = document.getElementById('new-preset-form');
  const editModal  = document.getElementById('edit-modal');
  let   presetEditId;
  if (presetList) {
    async function loadPresets() {
      const list = await api('/api/presets');
      presetList.innerHTML = '';
      list.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `
          <strong>${p.name}</strong> (${p.calories} kcal)
          <button class="view-items">View Items</button>
          <button class="edit-preset">Edit</button>
          <button class="delete-preset">Delete</button>
          <div class="items-list hidden"></div>`;
        li.querySelector('.view-items').onclick = () => {
          const div = li.querySelector('.items-list');
          div.innerHTML = p.items.map(it => `<div>${it.n}: ${it.c} kcal</div>`).join('');
          div.classList.toggle('hidden');
        };
        li.querySelector('.edit-preset').onclick = () => {
          presetEditId = p.id;
          document.getElementById('edit-name').value = p.name;
          document.getElementById('edit-cal').value  = p.calories;
          editModal.classList.remove('hidden');
        };
        li.querySelector('.delete-preset').onclick = async () => { await api(`/api/presets/${p.id}`, { method: 'DELETE' }); loadPresets(); };
        presetList.append(li);
      });
    }
    newForm.onsubmit = async e => {
      e.preventDefault();
      const name = document.getElementById('new-preset-name').value;
      const cal  = Number(document.getElementById('new-preset-calories').value);
      await api('/api/presets', { method: 'POST', body: JSON.stringify({ name, calories: cal, items: [] }) });
      newForm.reset();
      loadPresets();
    };
    document.getElementById('save-edit').onclick   = async () => { const name = document.getElementById('edit-name').value; const cal = Number(document.getElementById('edit-cal').value); await api(`/api/presets/${presetEditId}`, { method: 'PUT', body: JSON.stringify({ name, calories: cal, items: [] }) }); editModal.classList.add('hidden'); loadPresets(); };
    document.getElementById('cancel-edit').onclick = () => editModal.classList.add('hidden');
    loadPresets();
  }

  // -----------------
  // Settings page
  // -----------------
  const profForm    = document.getElementById('profile-form');
  const goalForm    = document.getElementById('calorie-form');
  const goalMessage = document.getElementById('goal-message');

  // — Profile (name + email)
  if (profForm) {
    api('/api/me').then(u => {
      document.getElementById('profile-name').value  = u.name;
      document.getElementById('profile-email').value = u.email;
    });

    profForm.onsubmit = async e => {
      e.preventDefault();
      const name  = document.getElementById('profile-name').value;
      const email = document.getElementById('profile-email').value;

      await api('/api/me', {
        method: 'PUT',
        body: JSON.stringify({ name, email })
      });

      alert('Profile updated.');
    };
  }

  // — Calorie Goal
  if (goalForm) {
    // prefill existing goal
    api('/api/settings').then(s => {
      document.getElementById('calorie-goal').value = s.calorieGoal || '';
    });

    goalForm.onsubmit = async e => {
      e.preventDefault();
      const goal = Number(document.getElementById('calorie-goal').value);

      // 1) save the new goal
      await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          reminderInterval: null,  // leave unchanged
          calorieGoal: goal
        })
      });

      // 2) redirect to dashboard so it fetches the updated goal
      window.location.href = '/dashboard.html';
    };
  }


  // — Password
  const pwForm = document.getElementById('password-form');
  if (pwForm) {
    pwForm.onsubmit = async e => {
      e.preventDefault();
      const current = document.getElementById('current-pw').value;
      const next    = document.getElementById('new-pw').value;
      const confirm = document.getElementById('confirm-pw').value;
      if (next !== confirm) return alert('Passwords do not match.');

      await api('/api/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current, next })
      });

      alert('Password changed.');
    };
  }

  // -----------------
  // Food Items page
  // -----------------
  const itemList  = document.getElementById('food-item-list');
  const itemModal = document.getElementById('item-modal');
  const addItemBtn= document.getElementById('add-item-btn');
  let   editItemId;
  if (itemList) {
    async function loadItems() {
      const list = await api('/api/food-items');itemList.innerHTML = '';
      list.forEach(i => {
        const li = document.createElement('li');
        li.innerHTML = `${i.name} — ${i.calories} kcal <button class='edit-item'>Edit</button> <button class='delete-item'>Delete</button>`;
        li.querySelector('.edit-item').onclick = () => openItemModal(i);
        li.querySelector('.delete-item').onclick = async () => { await api(`/api/food-items/${i.id}`, { method:'DELETE' }); loadItems(); };
        itemList.append(li);
      });
    }
    function openItemModal(item={}) {
      editItemId = item.id || null;
      document.getElementById('item-modal-title').innerText = item.id ? 'Edit Item' : 'Add Item';
      document.getElementById('item-name').value = item.name || '';
      document.getElementById('item-cal').value = item.calories || '';
      itemModal.classList.remove('hidden');
    }
    document.getElementById('cancel-item').onclick = () => itemModal.classList.add('hidden');
    document.getElementById('save-item').onclick = async () => {
      const name = document.getElementById('item-name').value.trim();
      const cal = Number(document.getElementById('item-cal').value);
      const method = editItemId ? 'PUT' : 'POST';
      const url = editItemId ? `/api/food-items/${editItemId}` : '/api/food-items';
      await api(url, { method, body: JSON.stringify({ name, calories: cal }) });
      itemModal.classList.add('hidden');
      loadItems();
    };
    addItemBtn.onclick = () => openItemModal();
    loadItems();
  }

});

