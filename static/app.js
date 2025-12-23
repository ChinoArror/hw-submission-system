


async function login() {
  const role = document.getElementById('role').value;
  const name = document.getElementById('name').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name, password })
    });

    const data = await res.json();

    if (!data.ok) {
      alert(data.message || '登录失败');
      return;
    }

    auth = {
      role: data.role,
      name: data.name,
      token: data.token
    };
    localStorage.setItem('auth', JSON.stringify(auth));

    document.getElementById('loginModal').classList.add('hidden');
    renderHome();

  } catch (e) {
    console.error(e);
    alert('登录异常，请查看控制台');
  }
}

async function renderHome() {
  const res = await fetch('/api/subjects');
  const data = await res.json();

  app.innerHTML = `
    <div class="subject-grid">
      ${data.data.map(s => `
        <div class="card" onclick="openSubject('${s.code}')">
          ${s.title}
        </div>
      `).join('')}
    </div>
  `;
}

async function openSubject(code) {
  const res = await fetch('/api/roster');
  const data = await res.json();

  const groups = {};
  data.data.forEach(s => {
    groups[s.group_index] ||= [];
    groups[s.group_index].push(s);
  });

  app.innerHTML = `
    <h2>${code}</h2>
    <div class="roster">
      ${Object.values(groups).map(g => `
        <div class="group">
          ${g.map(s => `
            <div class="student">
              <span>${s.name}</span>
              <span>❌</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

renderHome();
