// src/worker.js
import roster01 from "../sample_data/roster.example-01.json";
import roster02 from "../sample_data/roster.example-02.json";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ① API 一定要最优先拦截
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    // 新增：将学科与登录等前端路由统一回退到 index.html（用于前端路由渲染）
    const routeSet = new Set(['/chinese','/math','/english','/physics','/chemistry','/biology','/login','/home']);
    if (routeSet.has(url.pathname)) {
      const rewritten = new Request(new URL('/index.html', request.url), request);
      return env.ASSETS.fetch(rewritten);
    }

    // ② 其余全部交给静态资源
    return env.ASSETS.fetch(request);
  }
};

/* -----------------------
   Configuration & Auth
   ----------------------- */
function getConfig(env) {
  let teachers = [];
  try {
    teachers = JSON.parse(env.TEACHER_CREDENTIALS || '[]');
  } catch (e) {
    teachers = [];
  }

  return {
    adminPass: env.ADMIN_PASS || 'admin123',
    guestPass: env.GUEST_PASS || 'guest123',
    teachers
  };
}

function checkAdmin(auth) {
  return auth && auth.role === 'admin' && auth.password === (globalThis.__ADMIN_PASS || auth.password);
}
function authenticateBasic(body, env) {
  // body: {role, name?, password}
  const cfg = getConfig(env);
  if (!body || !body.role) return null;
  if (body.role === 'admin' && body.password === cfg.adminPass) return { role: 'admin', name: 'admin' };
  if (body.role === 'guest' && body.password === cfg.guestPass) return { role: 'guest', name: 'guest' };
  if (body.role === 'teacher') {
    for (const t of cfg.teachers) {
      if (t.name === body.name && t.pass === body.password) return { role: 'teacher', name: t.name };
    }
  }
  return null;
}

// 新增：支持基于 token 的认证（登录成功后前端使用 token，而不是再次提交明文密码）
function authenticate(body, env) {
  if (!body) return null;
  if (body.token) {
    try {
      const payload = JSON.parse(atob(body.token));
      if (!payload.role || !payload.name) return null;
      return { role: payload.role, name: payload.name };
    } catch (e) {
    }
  }
  return authenticateBasic(body, env);
}

/* -----------------------
   API Router
   ----------------------- */
async function ensureTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    group_index INTEGER NOT NULL,
    seat_index INTEGER NOT NULL,
    class_no TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    class_no TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    roster_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS statuses_pos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    class_no TEXT NOT NULL,
    group_index INTEGER NOT NULL,
    seat_index INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id, class_no, group_index, seat_index)
  )`).run();
  try { await env.DB.prepare(`ALTER TABLE roster ADD COLUMN class_no TEXT`).run(); } catch(e) {}
  try { await env.DB.prepare(`ALTER TABLE assignments ADD COLUMN class_no TEXT`).run(); } catch(e) {}
}
async function handleApi(req, env) {
  await ensureTables(env);
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\//, '');
  if (p === 'login' && req.method === 'POST') {
    const body = await req.json();
    const auth = authenticateBasic(body, env);
    if (!auth) return jsonResponse({ ok: false, message: '认证失败' }, 401);
    // 返回一个简单的 token（未签名）供前端 cookie 使用；实际可以用更安全的 JWT
    const token = btoa(JSON.stringify({ role: auth.role, name: auth.name, t: Date.now() }));
    return jsonResponse({ ok: true, token, role: auth.role, name: auth.name });
  }

  // 读取 roster
  if (p === 'roster' && req.method === 'GET') {
    await ensureRosterFromSample(env);
    const classNo = url.searchParams.get('class_no') || '01';
    const group = url.searchParams.get('group');
    const db = env.DB;
    const q = group ? `SELECT * FROM roster WHERE class_no = ? AND group_index = ? ORDER BY seat_index` : `SELECT * FROM roster WHERE class_no = ? ORDER BY group_index, seat_index`;
    const stmt = db.prepare(q);
    const res = group ? await stmt.bind(classNo, Number(group)).all() : await stmt.bind(classNo).all();
    return jsonResponse({ ok: true, data: res.results || [] });
  }

  if (p === 'classes' && req.method === 'GET') {
    await ensureRosterFromSample(env);
    const rows = await env.DB.prepare('SELECT DISTINCT class_no FROM roster ORDER BY class_no').all();
    const list = (rows.results || []).map(r => r.class_no).filter(Boolean);
    return jsonResponse({ ok: true, data: list.length ? list : ['01'] });
  }

  // 导入 roster: 支持 JSON {groups:[ [name...], ... ]} 或 CSV 文本
  if (p === 'roster/import' && req.method === 'POST') {
    // 仅 admin 或 teacher 可导入
    const body = await parseBody(req);
    const authUser = authenticate(body.auth || {}, env);
    if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'teacher')) return jsonResponse({ ok: false, message: '无权限' }, 403);
    const classNo = body.class_no || '01';

    // Accept either JSON groups or CSV raw
    if (body.csv) {
      // parse CSV: CSV format: group,seat,name  （示例在 README）
      const lines = body.csv.split(/\r?\n/).filter(Boolean);
      const rows = lines.map(l => l.split(',').map(s => s.trim()));
      // insert into roster (first clear existing)
      await env.DB.prepare('DELETE FROM roster WHERE class_no = ?;').bind(classNo).run();
      const stmt = await env.DB.prepare('INSERT INTO roster (name, group_index, seat_index, class_no) VALUES (?,?,?,?)');
      for (const r of rows) {
        const g = Number(r[0]); const seat = Number(r[1]); const name = r[2];
        await stmt.bind(name, g, seat, classNo).run();
      }
      const assignmentsRows = await env.DB.prepare('SELECT id FROM assignments WHERE class_no = ?').bind(classNo).all();
      const rosterRows = await env.DB.prepare('SELECT group_index, seat_index FROM roster WHERE class_no = ?').bind(classNo).all();
      for (const a of assignmentsRows.results || []) {
        for (const s of rosterRows.results || []) {
          await env.DB.prepare('INSERT OR IGNORE INTO statuses_pos (assignment_id,class_no,group_index,seat_index,status) VALUES (?,?,?,?,?)').bind(a.id, classNo, s.group_index, s.seat_index, 'missing').run();
        }
      }
      return jsonResponse({ ok: true, message: 'CSV 导入完成' });
    } else if (body.groups) {
      // body.groups is array of arrays: groups[0] -> group 1's names (top->down)
      await env.DB.prepare('DELETE FROM roster WHERE class_no = ?;').bind(classNo).run();
      let insertStmt = await env.DB.prepare('INSERT INTO roster (name, group_index, seat_index, class_no) VALUES (?,?,?,?)');
      for (let gi = 0; gi < body.groups.length; gi++) {
        const grp = body.groups[gi] || [];
        for (let si = 0; si < grp.length; si++) {
          const name = grp[si];
          await insertStmt.bind(name, gi+1, si+1, classNo).run();
        }
      }
      const assignmentsRows = await env.DB.prepare('SELECT id FROM assignments WHERE class_no = ?').bind(classNo).all();
      const rosterRows = await env.DB.prepare('SELECT group_index, seat_index FROM roster WHERE class_no = ?').bind(classNo).all();
      for (const a of assignmentsRows.results || []) {
        for (const s of rosterRows.results || []) {
          await env.DB.prepare('INSERT OR IGNORE INTO statuses_pos (assignment_id,class_no,group_index,seat_index,status) VALUES (?,?,?,?,?)').bind(a.id, classNo, s.group_index, s.seat_index, 'missing').run();
        }
      }
      return jsonResponse({ ok: true, message: 'JSON roster 导入完成' });
    } else {
      return jsonResponse({ ok: false, message: '缺少 roster 数据' }, 400);
    }
  }

  // Subjects 列表（GET）, admin 能 add subject (POST)
  if (p === 'subjects' && req.method === 'GET') {
  try {
    const rows = await env.DB.prepare(
      'SELECT * FROM subjects'
    ).all();

    // 如果表是空的，初始化 6 科
    if (!rows.results || rows.results.length === 0) {
      const defaults = [
        ['chinese','语文'],
        ['math','数学'],
        ['english','英语'],
        ['physics','物理'],
        ['chemistry','化学'],
        ['biology','生物']
      ];
      for (const [code, title] of defaults) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO subjects (code, title) VALUES (?, ?)'
        ).bind(code, title).run();
      }
    }

    const finalRows = await env.DB.prepare(
      'SELECT * FROM subjects'
    ).all();

    return jsonResponse({ ok: true, data: finalRows.results });

  } catch (e) {
    return jsonResponse(
      { ok: false, message: 'subjects 查询失败', error: e.message },
      500
    );
  }
}

  // assignments: add/read
  if (p.startsWith('assignments')) {
    if (req.method === 'GET') {
      // ?subject=math&date=YYYY-MM-DD
      const subject = url.searchParams.get('subject');
      const date = url.searchParams.get('date');
      const classNo = url.searchParams.get('class_no') || '01';
      const rows = await env.DB.prepare('SELECT * FROM assignments WHERE subject_code = ? AND date = ? AND class_no = ?').bind(subject, date, classNo).all();
      return jsonResponse({ ok: true, data: rows.results || [] });
    }
    if (req.method === 'POST') {
      // 添加作业: body {auth:{...}, subject, date, title}
      try {
        const body = await req.json();
        const authUser = authenticate(body.auth || {}, env);
        if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'teacher')) return jsonResponse({ ok: false, message: '无权限' }, 403);
        const { subject, date, title, class_no } = body;
        const classNo = class_no || '01';
        if (!subject || !date || !title) return jsonResponse({ ok: false, message: '缺少参数' }, 400);
        const r = await env.DB.prepare('INSERT INTO assignments (subject_code,title,date,created_by,class_no) VALUES (?,?,?,?,?)').bind(subject, title, date, authUser.name, classNo).run();
        let id = (r && r.meta && typeof r.meta.last_row_id !== 'undefined') ? r.meta.last_row_id : (r && (r.lastInsertRowId || r.lastInsertRowID));
        if (!id) {
          const last = await env.DB.prepare('SELECT last_insert_rowid() AS id').all();
          id = (last.results && last.results[0] && last.results[0].id) || id;
        }
        if (!id) return jsonResponse({ ok: false, message: '无法获取新作业ID' }, 500);
        const rosterRows = await env.DB.prepare('SELECT * FROM roster WHERE class_no = ?').bind(classNo).all();
        const rosterList = rosterRows.results || [];
        for (const s of rosterList) {
          await env.DB.prepare('INSERT OR IGNORE INTO statuses_pos (assignment_id,class_no,group_index,seat_index,status) VALUES (?,?,?,?,?)').bind(id, classNo, s.group_index, s.seat_index, 'missing').run();
        }
        return jsonResponse({ ok: true, id });
      } catch (e) {
        return jsonResponse({ ok: false, message: '添加作业失败', error: e.message }, 500);
      }
    }
  }

  // statuses update / get
  if (p.startsWith('statuses')) {
    if (req.method === 'GET') {
      // ?assignment_id=xx
      const aid = url.searchParams.get('assignment_id');
      const classNo = url.searchParams.get('class_no') || '01';
      const rows = await env.DB.prepare(`
        SELECT sp.* FROM statuses_pos sp
        JOIN roster r ON r.class_no = sp.class_no AND r.group_index = sp.group_index AND r.seat_index = sp.seat_index
        WHERE sp.assignment_id = ? AND sp.class_no = ?
      `).bind(Number(aid), classNo).all();
      return jsonResponse({ ok: true, data: rows.results || [] });
    }
    if (req.method === 'POST') {
      // body {auth:{...}, assignment_id, class_no, group_index, seat_index, status}
      const body = await req.json();
      const authUser = authenticate(body.auth || {}, env);
      if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'teacher')) return jsonResponse({ ok: false, message: '无权限' }, 403);
      const { assignment_id, class_no, group_index, seat_index, status, note } = body;
      if (!assignment_id || !class_no || !group_index || !seat_index || !status) return jsonResponse({ ok: false, message: '缺少参数' }, 400);
      await env.DB.prepare(`
        INSERT INTO statuses_pos (assignment_id,class_no,group_index,seat_index,status,note,updated_by,updated_at)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(assignment_id,class_no,group_index,seat_index)
        DO UPDATE SET status=excluded.status, note=excluded.note, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP
      `).bind(assignment_id, class_no, group_index, seat_index, status, note||'', authUser.name).run();
      return jsonResponse({ ok: true });
    }
  }

  // 统计模块： /api/statistics?date=YYYY-MM-DD&subject=math
  if (p === 'statistics' && req.method === 'GET') {
    const subject = url.searchParams.get('subject');
    const date = url.searchParams.get('date');
    const classNo = url.searchParams.get('class_no') || '01';
    const asRows = await env.DB.prepare('SELECT * FROM assignments WHERE subject_code = ? AND date = ? AND class_no = ?').bind(subject, date, classNo).all();
    const assign = (asRows.results || [])[0];
    if (!assign) return jsonResponse({ ok: false, message: '该科目该日无作业' }, 404);
    const stats = await env.DB.prepare(`
      SELECT sp.status as status, COUNT(*) as cnt 
      FROM statuses_pos sp 
      JOIN roster r ON r.class_no = sp.class_no AND r.group_index = sp.group_index AND r.seat_index = sp.seat_index
      WHERE sp.assignment_id = ? AND sp.class_no = ?
      GROUP BY sp.status
    `).bind(assign.id, classNo).all();
    const total = (await env.DB.prepare('SELECT COUNT(*) as c FROM roster WHERE class_no = ?').bind(classNo).all()).results[0].c;
    const map = { ok:0, revise:0, missing:0, leave:0 };
    for (const r of stats.results || []) map[r.status] = r.cnt;
    return jsonResponse({ ok: true, total, map });
  }

  return jsonResponse({ ok: false, message: '未找到 API' }, 404);
}

/* -----------------------
  Utility
 ----------------------- */
async function ensureRosterFromSample(env) {
  const autoReset = (env.RESET_ROSTER_ON_DEPLOY || 'true') !== 'false';
  if (!autoReset) return;
  const datasets = [];
  if (roster01 && Array.isArray(roster01.groups)) datasets.push({ no: '01', groups: roster01.groups });
  if (roster02 && Array.isArray(roster02.groups)) datasets.push({ no: '02', groups: roster02.groups });
  for (const ds of datasets) {
    const versionString = JSON.stringify(ds.groups);
    const storedVersion = await env.CONFIG_KV.get('ROSTER_VERSION_STRING:' + ds.no);
    const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM roster WHERE class_no = ?').bind(ds.no).all();
    const existingCount = (countRow.results && countRow.results[0] && countRow.results[0].c) || 0;
    if (storedVersion === versionString && existingCount > 0) continue;
    await env.DB.prepare('DELETE FROM roster WHERE class_no = ?').bind(ds.no).run();
    const insertStmt = await env.DB.prepare('INSERT INTO roster (name, group_index, seat_index, class_no) VALUES (?,?,?,?)');
    for (let gi = 0; gi < ds.groups.length; gi++) {
      const grp = ds.groups[gi] || [];
      for (let si = 0; si < grp.length; si++) {
        const name = grp[si];
        await insertStmt.bind(name, gi + 1, si + 1, ds.no).run();
      }
    }
    const assignmentsRows = await env.DB.prepare('SELECT id FROM assignments WHERE class_no = ?').bind(ds.no).all();
    const rosterRows = await env.DB.prepare('SELECT group_index, seat_index FROM roster WHERE class_no = ?').bind(ds.no).all();
    for (const a of assignmentsRows.results || []) {
      for (const s of rosterRows.results || []) {
        await env.DB.prepare('INSERT OR IGNORE INTO statuses_pos (assignment_id,class_no,group_index,seat_index,status) VALUES (?,?,?,?,?)').bind(a.id, ds.no, s.group_index, s.seat_index, 'missing').run();
      }
    }
    await env.CONFIG_KV.put('ROSTER_VERSION_STRING:' + ds.no, versionString);
  }
}

function jsonResponse(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json;charset=utf-8' } });
}

async function parseBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  const text = await req.text();
  // try parse as querystring-like
  try { return JSON.parse(text); } catch (e) {}
  return { csv: text };
}

/* -----------------------
  placeholder indexHTML (will be served by static/index.html in repo)
 ----------------------- */
const indexHTML = `
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>作业上交统计</title>
</head>
<body>
<div id="app">正在加载应用…</div>
<script>document.getElementById('app').innerText='请部署完整静态文件：static/index.html & static/app.js';</script>
</body>
</html>
`;

