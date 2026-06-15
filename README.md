# 墨语 AI Novel

AI 驱动的长篇小说创作平台，支持短篇/长篇两种模式，长篇采用 ReWOO + Reflexion + Graph-of-Thoughts 多智能体架构，自动维护世界观一致性、角色状态、伏笔追踪。

## 功能

- **短篇小说**：一次性生成 6000-8000 字完整故事
- **长篇小说**：150-200 章规划，4 章滑动窗口分批生成，框架表追踪世界一致性
- **中途指令**：生成过程中随时通过软/硬指令干预叙事方向
- **流式输出**：SSE 实时展示 AI 写作过程
- **社区广场**：公开作品浏览、点赞、收藏、评论

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Nuxt 4 (Vue 3 + Nitro) |
| 语言 | TypeScript |
| 数据库 | MySQL + Prisma ORM |
| AI 模型 | DeepSeek (Flash/Pro 混合路由) |
| 认证 | JWT (jose) |
| UI | Nuxt UI |

## 多智能体架构

长篇小说续写时，每轮生成前自动运行三层 Agent：

1. **ReWOO**（Flash 模型）：轻量级规划，输出情节节拍、伏笔目标、禁止事项
2. **Graph-of-Thoughts**（高潮章节触发）：3 条备选叙事路径 → 评分选最优 → 注入生成提示词
3. **Reflexion**（一致性审计失败后触发）：Pro 模型分析根本原因，沉淀经验教训供后续轮次参考

## 快速开始

### 前置条件

- Node.js 18+
- MySQL 8.0+
- DeepSeek API Key（[获取](https://platform.deepseek.com)）

### 1. 克隆项目

```bash
git clone <repo-url>
cd ai-novel
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的配置：

```env
DATABASE_URL="mysql://root:password@localhost:3306/ai_novel"
JWT_SECRET="随机字符串"
DEEPSEEK_API_KEY="sk-your-deepseek-key"
DEEPSEEK_API_KEY_PRO="sk-your-deepseek-pro-key"  # 可选，缺失时所有任务使用 Flash
DEEPSEEK_BASE_URL="https://api.deepseek.com"
```

### 3. 初始化数据库

```bash
npx prisma db push
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`

## 项目结构

```
├── app/
│   ├── pages/
│   │   ├── index.vue          # 创作页（短篇/长篇表单）
│   │   ├── read/[id].vue      # 阅读页（章节列表 + 继续生成）
│   │   ├── community.vue       # 社区广场
│   │   ├── auth.vue            # 登录注册
│   │   └── me.vue              # 个人中心
│   └── components/             # 可复用组件
├── server/
│   ├── api/
│   │   ├── auth/               # 认证（注册/登录）
│   │   ├── novels/             # 小说 CRUD + 生成 + 续写 + 互动
│   │   └── community/          # 社区接口
│   ├── services/
│   │   └── generation/         # 核心生成引擎
│   │       ├── engine.ts       # 记忆上下文 + 框架表
│   │       ├── prompt.ts       # 提示词模板
│   │       ├── rewoo.ts        # ReWOO 规划 Agent
│   │       ├── reflexion.ts    # Reflexion 反思 Agent
│   │       └── graph-of-thoughts.ts  # GoT 多路径探索 Agent
│   └── utils/
│       ├── auth.ts             # JWT 工具
│       ├── model.ts            # 模型路由器（Flash/Pro）
│       └── prisma.ts           # 数据库客户端
└── prisma/
    └── schema.prisma           # 数据库模型定义
```

## License

MIT
