# hw-submission-system
1
# 作业上交统计系统（Cloudflare Workers）

## 功能
- 六科作业：语文 / 数学 / 英语 / 物理 / 化学 / 生物
- 身份权限
  - 管理员：admin（全权限）
  - 教师：可新增作业、修改状态
  - 访客：只读查看
- 作业状态
  - ✅ 合格
  - ✏️ 面批
  - ❌ 未交
  - 🟦 请假
- 按日期查看
- 按组竖向名单显示
- 统计页面（总人数、状态统计）

---

## 技术栈
- Cloudflare Workers
- D1（SQLite）
- KV（配置/缓存）
- 原生 HTML/CSS/JS（响应式）

---

## 部署步骤

### 1️⃣ 创建 D1
```bash
wrangler d1 create hw_db
```

### 2️⃣ 初始化数据库
```bash
npm run db:init
```

### 3️⃣ 名单维护（通过文件）
- 名单文件位置：sample_data/roster.example.json
- 修改该文件中的 groups（按组的纵向排列）
- 重新部署后，后端自动检测名单版本变化并同步到 D1
- 同步规则：
  - 替换 roster 表中的所有记录
  - 清空 statuses，并为所有已存在的作业重新生成默认状态（missing）
- 可通过设置环境变量 RESET_ROSTER_ON_DEPLOY=false 关闭自动同步（见 wrangler.toml 的 [vars] 段）

### 4️⃣ 本地开发
```bash
npm run dev
```
