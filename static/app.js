let auth = JSON.parse(localStorage.getItem('auth') || 'null');
const app = document.getElementById('app');
const statsBtn = document.getElementById('statsBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const backButtonEl = document.getElementById('backBtn');
let currentSubjectCode = null;
const assignmentRuntime = {};
let pendingLoginRole = null;

function getSelectedClass() {
  const cookie = document.cookie.split('; ').find(row => row.startsWith('selected_class='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : '01';
}
function setSelectedClass(classId) {
  document.cookie = `selected_class=${encodeURIComponent(classId)}; Max-Age=${7*24*3600}; path=/`;
}
function setupClassSelect() {
  const sel = document.getElementById('classSelect');
  if (!sel) return;
  fetch('/api/classes').then(r => r.json()).then(data => {
    const classes = (data && data.data) || ['01'];
    sel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
    const curr = getSelectedClass();
    sel.value = curr;
  }).catch(() => {
    const curr = getSelectedClass();
    sel.value = curr;
  });
  sel.onchange = () => {
    setSelectedClass(sel.value);
    const p = location.pathname;
    const map = {
      '/chinese': ['chinese','语文'],
      '/math': ['math','数学'],
      '/english': ['english','英语'],
      '/physics': ['physics','物理'],
      '/chemistry': ['chemistry','化学'],
      '/biology': ['biology','生物']
    };
    if (map[p]) {
      const [code, title] = map[p];
      renderSubjectPage(code, title);
    } else {
      renderHome();
    }
  };
}

loginBtn.addEventListener('click', () => {
  openLoginModal();
});
statsBtn.addEventListener('click', () => {
  renderStatisticsEntry();
});
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('auth');
    document.cookie = 'auth=; Max-Age=0; path=/';
    auth = null;
    applyHeaderByRole();
    renderHome();
  });
}

function applyHeaderByRole() {
  const role = auth?.role;
  if (auth) {
    statsBtn.classList.remove('hidden');
  } else {
    statsBtn.classList.add('hidden');
  }
  if (auth) {
    loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

async function populateHeaderNav() {
  const nav = document.getElementById('subjectNav');
  const res = await fetch('/api/subjects');
  const data = await res.json();
  nav.innerHTML = data.data.map(s => `<a href="/${s.code}" onclick="event.preventDefault();navigateToSubject('${s.code}','${s.title}')">${s.title}</a>`).join('');
}

async function ensureRosterLoaded() {
  const classNo = getSelectedClass();
  await fetch(`/api/roster?class_no=${encodeURIComponent(classNo)}`);
}

async function renderHome() {
  applyHeaderByRole();
  if (backButtonEl) backButtonEl.classList.add('hidden');
  setupClassSelect();
  await populateHeaderNav();
  await ensureRosterLoaded();

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
      openLoginModal();
      return;
    }
    renderSubjectPage(code, title);
  } else {
    renderHome();
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const stepRole = document.getElementById('loginStepRole');
  const stepCred = document.getElementById('loginStepCred');
  const titleEl = document.getElementById('loginTitle');
  const nameWrap = document.getElementById('nameWrap');
  const nameEl = document.getElementById('name');
  const passEl = document.getElementById('password');
  const roleEl = document.getElementById('role');

  pendingLoginRole = null;
  if (roleEl) roleEl.value = '';
  if (nameEl) nameEl.value = '';
  if (passEl) passEl.value = '';
  if (titleEl) titleEl.innerText = '选择身份';
  if (nameWrap) nameWrap.classList.add('hidden');
  if (stepCred) stepCred.classList.add('hidden');
  if (stepRole) stepRole.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

function chooseLoginRole(role) {
  const stepRole = document.getElementById('loginStepRole');
  const stepCred = document.getElementById('loginStepCred');
  const titleEl = document.getElementById('loginTitle');
  const roleEl = document.getElementById('role');
  const nameWrap = document.getElementById('nameWrap');
  const nameEl = document.getElementById('name');
  const passEl = document.getElementById('password');

  pendingLoginRole = role;
  if (roleEl) roleEl.value = role;
  if (nameEl) nameEl.value = '';
  if (passEl) passEl.value = '';
  if (titleEl) titleEl.innerText = role === 'teacher' ? '教师登录' : (role === 'admin' ? '管理员登录' : '访客登录');
  if (nameWrap) {
    if (role === 'teacher') nameWrap.classList.remove('hidden');
    else nameWrap.classList.add('hidden');
  }
  if (stepRole) stepRole.classList.add('hidden');
  if (stepCred) stepCred.classList.remove('hidden');
}

function backToRoleSelect() {
  const stepRole = document.getElementById('loginStepRole');
  const stepCred = document.getElementById('loginStepCred');
  const titleEl = document.getElementById('loginTitle');
  const roleEl = document.getElementById('role');
  const nameWrap = document.getElementById('nameWrap');
  const nameEl = document.getElementById('name');
  const passEl = document.getElementById('password');

  pendingLoginRole = null;
  if (roleEl) roleEl.value = '';
  if (nameEl) nameEl.value = '';
  if (passEl) passEl.value = '';
  if (titleEl) titleEl.innerText = '选择身份';
  if (nameWrap) nameWrap.classList.add('hidden');
  if (stepCred) stepCred.classList.add('hidden');
  if (stepRole) stepRole.classList.remove('hidden');
}

async function login() {
  const role = pendingLoginRole || document.getElementById('role').value;
  const name = role === 'teacher' ? document.getElementById('name').value : '';
  const password = document.getElementById('password').value;
  if (!role) { alert('请选择身份'); return; }
  if (role === 'teacher' && !name.trim()) { alert('请输入教师姓名'); return; }

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
    document.cookie = `auth=${encodeURIComponent(JSON.stringify(auth))}; Max-Age=${7*24*3600}; path=/`;

    document.getElementById('loginModal').classList.add('hidden');
    backToRoleSelect();
    applyHeaderByRole();
    renderHome();

  } catch (e) {
    console.error(e);
    alert('登录异常，请查看控制台');
  }
}

async function renderSubjectPage(code, title) {
  currentSubjectCode = code;
  if (backButtonEl) backButtonEl.classList.remove('hidden');
  setupClassSelect();
  await populateHeaderNav();
  await ensureRosterLoaded();

  const backHtml = `<button onclick="navigateTo('/')">返回主页</button>`;

  // 日期选择与新增作业控件（管理员/教师）
  const controls = `
    <div class="controls">
      ${backHtml}
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
  `;
  const today = new Date().toISOString().slice(0,10);
  const datePicker = document.getElementById('datePicker');
  datePicker.value = today;
  datePicker.addEventListener('change', () => loadAssignments(code, datePicker.value, null));
  loadAssignments(code, today, null);
}

async function createAssignment(subjectCode) {
  const date = document.getElementById('datePicker').value;
  const title = document.getElementById('assignmentTitle').value.trim();
  if (!date || !title) {
    alert('请填写日期与作业名称');
    return;
  }
  const body = { auth, subject: subjectCode, date, title, class_no: getSelectedClass() };
  const res = await fetch('/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    alert('添加作业失败：' + text.slice(0, 200));
    return;
  }
  if (!data.ok) { alert((data.error && (data.message + '：' + data.error)) || data.message || '添加作业失败'); return; }
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
  const res = await fetch(`/api/statistics?date=${encodeURIComponent(date)}&subject=${encodeURIComponent(subject)}&class_no=${encodeURIComponent(getSelectedClass())}`);
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
  const classNo = getSelectedClass();
  const res = await fetch(`/api/assignments?subject=${encodeURIComponent(subjectCode)}&date=${encodeURIComponent(date)}&class_no=${encodeURIComponent(classNo)}`);
  const data = await res.json();
  if (!data.ok) { wrap.innerHTML = '<div class="card">该日暂无作业</div>'; return; }
  const items = data.data || [];
  if (items.length === 0) { wrap.innerHTML = '<div class="card">该日暂无作业</div>'; return; }

  wrap.innerHTML = items.map(a => `<div class="card" id="a-${a.id}"><h3>${a.title}</h3><div class="roster" id="grid-${a.id}"></div><div class="controls" id="stats-${a.id}"></div></div>`).join('');

  for (const a of items) {
    const grid = document.getElementById(`grid-${a.id}`);
    const statsBox = document.getElementById(`stats-${a.id}`);
    const editable = auth && (auth.role==='admin' || auth.role==='teacher');

    if (!auth) {
      const statusRes = await fetch(`/api/statuses?assignment_id=${a.id}&class_no=${encodeURIComponent(classNo)}`);
      const statusData = await statusRes.json();
      const rows = statusData.data || [];
      const counts = { ok:0, revise:0, missing:0, leave:0 };
      rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
      const total = rows.length;
      assignmentRuntime[a.id] = { counts, total };
      if (grid) {
        grid.innerHTML = `
          <div class="group">
            <div class="group-title">提示</div>
            <div class="student"><span>登录后可查看学生名单与详情</span></div>
          </div>
        `;
      }
      if (statsBox) {
        statsBox.innerHTML = `
          <span>总人数：<span id="cnt-${a.id}-total">${total}</span></span>
          <span>｜ 合格：<span id="cnt-${a.id}-ok">${counts.ok}</span></span>
          <span>｜ 面批：<span id="cnt-${a.id}-revise">${counts.revise}</span></span>
          <span>｜ 未交：<span id="cnt-${a.id}-missing">${counts.missing}</span></span>
          <span>｜ 请假：<span id="cnt-${a.id}-leave">${counts.leave}</span></span>
        `;
      }
      continue;
    }

    const statusRes = await fetch(`/api/statuses?assignment_id=${a.id}&class_no=${encodeURIComponent(classNo)}`);
    const statusData = await statusRes.json();
    const rows = statusData.data || [];
    const statusMap = new Map();
    for (const r of rows) statusMap.set(r.group_index + '-' + r.seat_index, r.status);
    let gmap = groups;
    if (!gmap) {
      const rosterRes = await fetch(`/api/roster?class_no=${encodeURIComponent(classNo)}`);
      const rosterData = await rosterRes.json();
      gmap = {};
      rosterData.data.forEach(s => {
        gmap[s.group_index] ||= [];
        gmap[s.group_index].push(s);
      });
    }
    // 渲染每个作业的名单网格
    grid.innerHTML = Object.entries(gmap).map(([gi,g]) => `
      <div class="group">
        <div class="group-title">第 ${gi} 组</div>
        ${g.map(s => {
          const st = statusMap.get(s.group_index + '-' + s.seat_index) || 'missing';
          const icon = iconFor(st);
          const handler = editable ? `onclick="cycleStatus(${a.id}, ${s.group_index}, ${s.seat_index})"` : '';
          return `
            <div class="student">
              <span>${s.name}</span>
              <span class="status" id="st-${a.id}-${s.group_index}-${s.seat_index}" data-status="${st}" ${handler}>${icon}</span>
            </div>
          `;
        }).join('')}
      </div>
    `).join('');

    // 统计显示
    const counts = { ok:0, revise:0, missing:0, leave:0 };
    const total = Object.values(gmap).reduce((acc, g) => acc + g.length, 0);
    Object.values(gmap).forEach(g => {
      g.forEach(s => {
        const st = statusMap.get(s.group_index + '-' + s.seat_index) || 'missing';
        if (counts[st] !== undefined) counts[st]++;
      });
    });
    assignmentRuntime[a.id] = { counts, total };
    statsBox.innerHTML = `
      ${editable ? `<button onclick="bulkOk(${a.id})">全部上交</button>` : ''}
      <span>总人数：<span id="cnt-${a.id}-total">${total}</span></span>
      <span>｜ 合格：<span id="cnt-${a.id}-ok">${counts.ok}</span></span>
      <span>｜ 面批：<span id="cnt-${a.id}-revise">${counts.revise}</span></span>
      <span>｜ 未交：<span id="cnt-${a.id}-missing">${counts.missing}</span></span>
      <span>｜ 请假：<span id="cnt-${a.id}-leave">${counts.leave}</span></span>
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
function applyStatusToEl(el, status) {
  if (!el) return;
  el.dataset.status = status;
  el.innerHTML = iconFor(status);
}
function renderStatsFromRuntime(assignmentId) {
  const rt = assignmentRuntime[assignmentId];
  if (!rt || !rt.counts) return;
  const c = rt.counts;
  const okEl = document.getElementById(`cnt-${assignmentId}-ok`);
  const reviseEl = document.getElementById(`cnt-${assignmentId}-revise`);
  const missingEl = document.getElementById(`cnt-${assignmentId}-missing`);
  const leaveEl = document.getElementById(`cnt-${assignmentId}-leave`);
  if (okEl) okEl.innerText = String(c.ok);
  if (reviseEl) reviseEl.innerText = String(c.revise);
  if (missingEl) missingEl.innerText = String(c.missing);
  if (leaveEl) leaveEl.innerText = String(c.leave);
}
function updateCountsAndStats(assignmentId, fromStatus, toStatus) {
  const rt = assignmentRuntime[assignmentId];
  if (!rt || !rt.counts) return;
  if (rt.counts[fromStatus] !== undefined) rt.counts[fromStatus] = Math.max(0, rt.counts[fromStatus] - 1);
  if (rt.counts[toStatus] !== undefined) rt.counts[toStatus] = (rt.counts[toStatus] || 0) + 1;
  renderStatsFromRuntime(assignmentId);
}
async function cycleStatus(assignmentId, groupIndex, seatIndex) {
  if (!(auth && (auth.role==='admin' || auth.role==='teacher'))) return;
  const el = document.getElementById(`st-${assignmentId}-${groupIndex}-${seatIndex}`);
  const curr = (el && el.dataset && el.dataset.status) ? el.dataset.status : 'missing';
  const next = nextStatus(curr);
  applyStatusToEl(el, next);
  updateCountsAndStats(assignmentId, curr, next);
  const res = await fetch('/api/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth, assignment_id: assignmentId, class_no: getSelectedClass(), group_index: groupIndex, seat_index: seatIndex, status: next })
  });
  const data = await res.json();
  if (!data.ok) {
    applyStatusToEl(el, curr);
    updateCountsAndStats(assignmentId, next, curr);
    alert(data.message || '更新失败');
    return;
  }
}

async function bulkOk(assignmentId) {
  if (!(auth && (auth.role==='admin' || auth.role==='teacher'))) return;
  const card = document.getElementById(`a-${assignmentId}`);
  const rt = assignmentRuntime[assignmentId];
  const statusEls = card ? Array.from(card.querySelectorAll(`.status[id^="st-${assignmentId}-"]`)) : [];
  const total = rt?.total ?? statusEls.length;
  statusEls.forEach(el => applyStatusToEl(el, 'ok'));
  assignmentRuntime[assignmentId] = { counts: { ok: total, revise: 0, missing: 0, leave: 0 }, total };
  renderStatsFromRuntime(assignmentId);
  const res = await fetch('/api/statuses/bulk_ok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth, assignment_id: assignmentId, class_no: getSelectedClass() })
  });
  const data = await res.json();
  if (!data.ok) {
    alert(data.message || '批量更新失败');
    const datePicker = document.getElementById('datePicker');
    if (currentSubjectCode && datePicker) loadAssignments(currentSubjectCode, datePicker.value, null);
  }
}

// 初始路由渲染
route();
