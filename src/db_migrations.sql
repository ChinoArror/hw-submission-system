-- roster table: 存学生信息
CREATE TABLE IF NOT EXISTS roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_index INTEGER NOT NULL,     -- 1..6
  seat_index INTEGER NOT NULL       -- 在组内的纵向序号（1..）
);

-- subjects table: 科目名称
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,        -- e.g. "chinese","math","english","physics","chem","bio"
  title TEXT NOT NULL
);

-- assignments table: 每个科目的作业项（按日期）
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_code TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,               -- ISO 日期 YYYY-MM-DD
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- statuses table: 每个人每作业的状态记录
CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  status TEXT NOT NULL,             -- "ok","revise","missing","leave"
  note TEXT,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (roster_id) REFERENCES roster(id)
);
