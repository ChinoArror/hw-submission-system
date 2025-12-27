let auth = JSON.parse(localStorage.getItem('auth') || 'null');
const app = document.getElementById('app');
const statsBtn = document.getElementById('statsBtn');
const loginBtn = document.getElementById('loginBtn');

loginBtn.addEventListener('click', () => {
  document.getElementById('loginModal').classList.remove('hidden');
});
statsBtn.addEventListener('click', () => {
  renderStatisticsEntry();
});

function applyHeaderByRole() {
  const role = auth?.role;
  if (role === 'admin' || role === 'teacher') {
    statsBtn.classList.remove('hidden');
  } else {
    statsBtn.classList.add('hidden');
  }
}

// 新增：退出登录按钮与逻辑
function renderHeaderActions() {
  const actions = document.querySelector('.header-actions');
  // 清理已有退出按钮避免重复
  const existingLogout = document.getElementById('logoutBtn');
  if (existingLogout) existingLogout.remove();
  if (auth) {
    const btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.textContent = '退出';
    btn.addEventListener('click', () => {
      localStorage.removeItem('auth');
      auth = null;
      applyHeaderByRole();
      renderHome();
    });
    actions.appendChild(btn);
  }
}

async function renderHome() {
  applyHeaderByRole();
  renderHeaderActions();

  const res = await fetch('/api/subjects');
  const data = await res.json();

  app.innerHTML = `
    <div class="subject-grid">
      ${data.data.map(s => `
        <div class="card" onclick="navigateToSubject('${s.code}','${s.title}')">
          ${s.title}
        </div>
      `).join('')}
    </div>
  `;
}

// 新增：独立页面导航与返回
function navigateTo(path) {
  history.pushState({}, '', path);
  // 统一在前端根据路径渲染
  route();
}

function navigateToSubject(code, title) {
  navigateTo('/' + code);
  renderSubjectPage(code, title);
}

window.addEventListener('popstate', route);
function route() {
  const p = location.pathname;
  const map = {
    '/chinese': ['chinese','语文'],
    '/math': ['math','数学'],
    '/english': ['english','英语'],
    '/physics': ['physics','物理'],
    '/chemistry': ['chemistry','化学'],
    '/biology': ['biology','生物'],
    '/login': ['login','登录']
  };
  if (map[p]) {
    const [code, title] = map[p];
    if (code === 'login') {
      document.getElementById('loginModal').classList.remove('hidden');
      return;
    }
    renderSubjectPage(code, title);
  } else {
    renderHome();
  }
}

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
    applyHeaderByRole();
    renderHeaderActions();
    renderHome();

  } catch (e) {
    console.error(e);
    alert('登录异常，请查看控制台');
  }
}

async function renderSubjectPage(code, title) {
  const res = await fetch('/api/roster');
  const data = await res.json();

  const groups = {};
  data.data.forEach(s => {
    groups[s.group_index] ||= [];
    groups[s.group_index].push(s);
  });

  // 返回按钮
  const backBtn = `<button onclick="navigateTo('/')">返回主页</button>`;

  // 日期选择与新增作业控件（管理员/教师）
  const controls = `
    <div class="controls">
      ${backBtn}
      <input type="date" id="datePicker" />
      ${auth && (auth.role==='admin' || auth.role==='teacher') ? `
        <input type="text" id="assignmentTitle" placeholder="作业名称" />
        <button onclick="createAssignment('${code}')">添加作业</button>
      ` : ''}
    </div>
  `;

  app.innerHTML = `
    <h2>${title}（${code}）</h2>
    ${controls}
    <div id="assignments"></div>
    <div class="roster">
      ${Object.entries(groups).map(([gi,g]) => `
        <div class="group">
          <div class="group-title">第 ${gi} 组</div>
          ${g.map(s => `
            <div class="student">
              <span>${s.name}</span>
              <span class="status" id="status-${s.id}">❌</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
  const today = new Date().toISOString().slice(0,10);
  const datePicker = document.getElementById('datePicker');
  datePicker.value = today;
  datePicker.addEventListener('change', () => loadAssignments(code, datePicker.value, groups));
  loadAssignments(code, today, groups);
}

async function createAssignment(subjectCode) {
  const date = document.getElementById('datePicker').value;
  const title = document.getElementById('assignmentTitle').value.trim();
  if (!date || !title) {
    alert('请填写日期与作业名称');
    return;
  }
  const body = { auth, subject: subjectCode, date, title };
  const res = await fetch('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    alert(data.message || '添加作业失败');
    return;
  }
  alert('作业已创建');
  // 创建后自动刷新当前日期的作业列表
  loadAssignments(subjectCode, document.getElementById('datePicker').value, null);
}

async function renderStatisticsEntry() {
  app.innerHTML = `
    <div class="card">
      <h3>统计模块</h3>
      <div class="controls">
        <input id="statDate" type="date" />
        <select id="statSubject"></select>
        <button onclick="runStatistics()">查看统计</button>
      </div>
      <div id="statResult"></div>
    </div>
  `;
  // 填充学科选项
  const res = await fetch('/api/subjects');
  const data = await res.json();
  const sel = document.getElementById('statSubject');
  sel.innerHTML = data.data.map(s => `<option value="${s.code}">${s.title}</option>`).join('');
}

async function runStatistics() {
  const date = document.getElementById('statDate').value;
  const subject = document.getElementById('statSubject').value;
  if (!date || !subject) { alert('请选择日期与学科'); return; }
  const res = await fetch(`/api/statistics?date=${encodeURIComponent(date)}&subject=${encodeURIComponent(subject)}`);
  const data = await res.json();
  if (!data.ok) {
    document.getElementById('statResult').innerText = data.message || '统计失败';
    return;
  }
  const map = data.map;
  document.getElementById('statResult').innerHTML = `
    <div>总人数：${data.total}</div>
    <div>合格：${map.ok}；面批：${map.revise}；未交：${map.missing}；请假：${map.leave}</div>
  `;
}

async function loadAssignments(subjectCode, date, groups) {
  const wrap = document.getElementById('assignments');
  wrap.innerHTML = '';
  const res = await fetch(`/api/assignments?subject=${encodeURIComponent(subjectCode)}&date=${encodeURIComponent(date)}`);
  const data = await res.json();
  if (!data.ok) { wrap.innerHTML = '<div class="card">该日暂无作业</div>'; return; }
  const items = data.data || [];
  if (items.length === 0) { wrap.innerHTML = '<div class="card">该日暂无作业</div>'; return; }

  // 针对同一天的多条作业，分别渲染一个卡片
  wrap.innerHTML = items.map(a => `<div class="card" id="a-${a.id}"><h3>${a.title}</h3><div class="roster" id="grid-${a.id}"></div><div class="controls" id="stats-${a.id}"></div></div>`).join('');

  for (const a of items) {
    const statusRes = await fetch(`/api/statuses?assignment_id=${a.id}`);
    const statusData = await statusRes.json();
    const rows = statusData.data || [];
    const statusMap = new Map();
    for (const r of rows) statusMap.set(r.roster_id, r.status);
    // 如果外层未传 groups（例如刷新后），重新拉取 roster
    let gmap = groups;
    if (!gmap) {
      const rosterRes = await fetch('/api/roster');
      const rosterData = await rosterRes.json();
      gmap = {};
      rosterData.data.forEach(s => {
        gmap[s.group_index] ||= [];
        gmap[s.group_index].push(s);
      });
    }
    // 渲染每个作业的名单网格
    const grid = document.getElementById(`grid-${a.id}`);
    grid.innerHTML = Object.entries(gmap).map(([gi,g]) => `
      <div class="group">
        <div class="group-title">第 ${gi} 组</div>
        ${g.map(s => {
          const st = statusMap.get(s.id) || 'missing';
          const icon = iconFor(st);
          const clickable = auth && (auth.role==='admin' || auth.role==='teacher');
          const handler = clickable ? `onclick="cycleStatus(${a.id}, ${s.id}, '${st}')"` : '';
          return `
            <div class="student">
              <span>${s.name}</span>
              <span class="status" id="st-${a.id}-${s.id}" ${handler}>${icon}</span>
            </div>
          `;
        }).join('')}
      </div>
    `).join('');

    // 统计显示
    const statsBox = document.getElementById(`stats-${a.id}`);
    const counts = { ok:0, revise:0, missing:0, leave:0 };
    rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    const total = Object.values(gmap).reduce((acc, g) => acc + g.length, 0);
    statsBox.innerHTML = `
      <span>总人数：${total}</span>
      <span>｜ 合格：${counts.ok}</span>
      <span>｜ 面批：${counts.revise}</span>
      <span>｜ 未交：${counts.missing}</span>
      <span>｜ 请假：${counts.leave}</span>
    `;
  }
}

function iconFor(status) {
  return ICONS?.[status] || '❔';
}

function nextStatus(curr) {
  const order = ['missing','revise','ok','leave'];
  const i = order.indexOf(curr);
  return order[(i+1) % order.length];
}
async function cycleStatus(assignmentId, rosterId, curr) {
  if (!(auth && (auth.role==='admin' || auth.role==='teacher'))) return;
  const next = nextStatus(curr);
  const res = await fetch('/api/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth, assignment_id: assignmentId, roster_id: rosterId, status: next })
  });
  const data = await res.json();
  if (!data.ok) { alert(data.message || '更新失败'); return; }
  const el = document.getElementById(`st-${assignmentId}-${rosterId}`);
  if (el) el.innerHTML = iconFor(next);
}

// 初始路由渲染
route();
