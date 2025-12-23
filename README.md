# hw-submission-system

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
