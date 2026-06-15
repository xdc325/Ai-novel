# AI 小说生成平台 — 设计文档

## 产品定位
面向**读者**（非写作者）的标签驱动 AI 小说生成 + 社区阅读平台。
核心体验：选标签 → 生成 → 直接阅读，惊喜感优先。

---

## 技术栈
- 前端：Vue 3 + Nuxt 3 + Nuxt UI
- 后端：Nitro (Nuxt server/) 三层架构（路由层 / 服务层 / 数据层）
- 数据库：MySQL + Prisma ORM
- 认证：JWT + bcrypt（预留 OAuth）
- AI：DeepSeek V4 Flash API

---

## 五层标签体系

| 层级 | 名称 | 类型 | 说明 |
|------|------|------|------|
| L1 | 世界观 | 单选必选 | 仙侠/末世/都市/科幻/奇幻/历史/悬疑/纯爱 |
| L2 | 人物配置 | 必选 | 男主数量(0-3+)、女主数量(0-3+)、感情线(无/单女主/纯剧情等)、主角性格关键词(输入)、人物关系起点(单选) |
| L3 | 场景偏好 | 可选 | 主要场景(多选:宗门/学院/都市/荒野/宫廷/星际/随机)、时代背景(单选) |
| L4 | 故事调性 | 多选 | 爽文/虐文/甜宠/热血/轻松日常/暗黑/烧脑/治愈 |
| L5 | 自由标签 | 用户输入 | 任意关键词，AI 理解并融入 |

---

## 生成策略

### 短篇 (≤10000字)
1. 后端根据标签生成"故事蓝图"（人物性格/核心冲突/伏笔/转折/结局）
2. 基于蓝图一次性生成全文
3. 返回完整小说，用户直接阅读

### 长篇 (>10000字)
1. 后端生成"故事蓝图 + 章节大纲"
2. 两章一轮生成，后台自动跟踪：
   - 角色认知状态 (knows/does_not_know)
   - 关系变化记录
   - 伏笔债务追踪（埋入/推进/回收）
   - 时间线一致性
3. 每章生成完推送，读者翻页即可
4. "换走向"按钮：对当前进度不满意可重新生成

---

## 前端页面

| 页面 | 路由 | 功能 |
|------|------|------|
| 首页/生成 | / | 五层标签选择 + 生成按钮 |
| 阅读器 | /read/[id] | 专注阅读、字号/暗色、章节导航（长篇）、换走向 |
| 社区广场 | /community | 卡片流、标签筛选、排行、搜索 |
| 个人中心 | /me | 我的小说、收藏、点赞记录 |
| 登录注册 | /auth | 邮箱+密码，JWT |

---

## 数据库表

- users: id, email, password_hash, nickname, avatar, created_at
- novels: id, user_id, title, summary, type(short/long), tags_json, status, word_count, created_at
- chapters: id, novel_id, number, title, content, status, created_at
- tags: id, name, level, parent_id, type(fixed/custom)
- novel_tags: id, novel_id, tag_id
- character_states: id, novel_id, chapter_id, name, knows_json, does_not_know_json, relationship_json (长篇跟踪用)
- foreshadowing: id, novel_id, planted_chapter, resolved_chapter, description, status (伏笔追踪)
- comments: id, user_id, novel_id, chapter_id, content, created_at
- likes: id, user_id, novel_id, created_at
- favorites: id, user_id, novel_id, created_at

---

## 后端架构

```
server/
├── api/
│   ├── auth/          # 注册、登录、token刷新
│   ├── novels/        # 小说CRUD、生成触发
│   ├── community/     # 广场列表、排行、搜索
│   ├── comments/      # 评论
│   └── user/          # 个人中心数据
├── services/
│   ├── generation/    # AI调用引擎、标签→prompt
│   ├── memory/        # 长篇记忆管理（角色/伏笔/时间线）
│   └── auth/          # JWT签发、验证
├── repositories/      # Prisma查询封装
└── middleware/         # auth中间件、错误处理
```

---

## AI Prompt 工程要点
- 标签体系 → 结构化 System Prompt
- 长篇每次生成注入：角色认知状态 + 伏笔债务 + 最近章节摘要
- 短篇注入：完整人物设定 + 伏笔计划 + 结局方向
- "惊喜感"指令：避免模板化，鼓励合理反转
