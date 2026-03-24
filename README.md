# 品牌内容工作台（Brand Hotspot Studio）

一个面向品牌团队与内容运营团队的 Web SaaS 工作台。

这套系统现在的主目标，已经不只是“抓热点然后生成 4 条文案”，而是把整条内容生产链路串起来：

`品牌底盘 -> 热点机会 -> AI 判断与选题 -> 审核 -> 一键制作 -> 编辑定稿 -> 发布执行`

当前产品定位更接近“品牌内容运营平台”：

- 先沉淀品牌资料与表达边界
- 再抓取外部热点与市场信号
- 用 Source-First AI 先判断值不值得做
- 通过审核后进入制作工作台
- 输出图文首版，并进入发布队列与结果回流

## 当前版本重点

- 支持 `workspace` 多组织协作
- 支持平台管理员后台、用户/组织管理、邀请码与审计日志
- 支持品牌底盘维护、品牌接入向导、资料补齐
- 支持热点同步、优先级评分、机会筛选
- 支持 Source-First 内容包生成，不再只依赖固定模板思路
- 支持审核流、退回改稿、批准进入制作
- 支持一键制作进入 `production-studio`
- 支持图文优先的分段生成、滚动补全、局部 AI 改写
- 支持导出与发布队列

## 主流程

### 1. 品牌底盘

在 `/brands` 和 `/onboarding` 里维护：

- 品牌定位
- 目标受众
- 内容语调
- 禁用表达
- 近期动态
- 品牌资料来源

这一步的意义是先把“什么能说、什么不能说、为什么这个品牌值得说”固定下来，避免后面的 AI 跑偏。

### 2. 热点机会

在 `/hotspots` 里查看同步回来的热点信号：

- 行业热点
- 大众热点
- 多源交叉命中
- 风险词与品牌相关性

系统会先做基础打分，再决定哪些值得进入选题。

### 3. Source-First 选题生成

内容包生成已经在往“Source-First AI”方向升级：

- 先读热点原始材料
- 再读品牌资料与边界
- 先做推荐判断
- 最后才进入写作

目标不是“把模板填满”，而是“先判断这件事值不值得做、适合怎么做”。

### 4. 审核台

在 `/review` 里完成：

- 审核通过
- 退回改稿
- 审核备注
- 是否允许进入后续制作链路

### 5. 内容制作

在 `/production-studio` 和 `/production-studio/[packId]` 里：

- 对通过审核的选题执行一键制作
- 当前优先交付图文首版
- 图文支持“先出首屏，再自动补全后半段”
- 支持标题/正文在线编辑
- 支持选中一段文字做局部 AI 改写

当前页面里虽然保留了视频、一键全做等作业类型，但现阶段真正优先打磨的是图文成稿体验。

### 6. 发布中心

在 `/publish` 里：

- 查看待发布内容
- 入发布队列
- 执行发布任务
- 查看失败原因和最近结果

目前发布执行器还是演示/联调用模拟 runner，方便把业务闭环跑通，后续可以替换成真实平台代发能力。

## 页面结构

### 业务工作台

- `/` 首页工作台
- `/brands` 品牌底盘
- `/onboarding` 品牌接入向导
- `/hotspots` 热点机会
- `/review` 审核台
- `/production-studio` 内容制作列表
- `/production-studio/[packId]` 单条内容制作工作台
- `/publish` 发布中心
- `/team` 成员管理
- `/account` 账号中心

### 账号与组织

- `/login`
- `/register`
- `/select-workspace`

### 平台后台

- `/admin`
- `/admin/users`
- `/admin/workspaces`
- `/admin/ai-routing`
- `/admin/vercel-usage`
- `/admin/logs`

## 角色模型

当前权限模型分两层：

- 平台角色：`super_admin`
- 组织角色：`org_admin`、`operator`、`approver`、`media_channel`

简单理解：

- `super_admin` 管平台
- `org_admin` 管自己组织
- `operator` 负责热点、内容生成和改稿
- `approver` 负责审核把关
- `media_channel` 更偏发布与渠道执行

权限边界以 `workspace` 为主，不按单个品牌做过细授权。

## 技术栈

- Next.js 15 App Router
- TypeScript
- React 19
- Supabase
- OpenAI SDK
- Gemini / MiniMax 路由能力

## 当前代码里的核心能力

### AI 路由

系统支持按功能选择模型与提供商，不同环节可以走不同模型策略。

已看到的重点能力包括：

- 内容生成路由
- 管理后台 AI 路由设置
- 模型测试接口

### 热点同步

热点同步入口：

- `POST /api/hotspots/sync`

当前仓库已经接入多类公开来源，包含 RSS 与部分结构化热榜接口。同步后会做去重、打分、补充理由和可达性校验。

### 内容包生成

主要入口：

- `POST /api/content-packs/generate`
- `GET /api/content-packs/[packId]/export`

### 一键制作

主要入口：

- `POST /api/production/one-click`
- `GET /api/production/jobs/[jobId]`
- `GET /api/production/packs/[packId]`
- `POST /api/production/packs/[packId]/continue`

### 发布

主要入口：

- `POST /api/publish/[packId]/queue`
- `POST /api/publish/run`
- `GET /api/publish/queue`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

### 3. 启动开发环境

```bash
npm run dev
```

默认地址：

- [http://localhost:3000](http://localhost:3000)

## 本地运行模式

这个项目做了“真环境优先，演示模式兜底”：

- 如果配置了 Supabase，就走真实账号、组织和业务数据
- 如果没配 Supabase，会退回本地数据模式，方便先看页面和流程
- 如果没配模型密钥，部分链路会退回模板/降级逻辑，方便先联通流程

这意味着你可以先把页面跑起来，再逐步补数据库和模型能力。

## 常用脚本

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run sync:hotspots
npm run run:publish
```

说明：

- `sync:hotspots`：触发热点同步脚本
- `run:publish`：执行发布队列 runner

## 环境变量

最常用的是下面这几类：

### 基础与认证

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOCAL_SESSION_SECRET`

### AI 模型

- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `GEMINI_MODEL`
- `GEMINI_SEARCH_MODEL`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `MINIMAX_MODEL`

### 热点同步

- `HOTSPOT_SYNC_SECRET`
- `APP_URL`
- `HOTSPOT_SYNC_URL`
- `HOTSPOT_RSS_LOCALE`
- `HOTSPOT_RSS_REGION`
- `HOTSPOT_RSS_EDITION`

### 热点源开关

- `ENABLE_RSS_CNBETA`
- `ENABLE_AUXILIARY_HOT_SOURCES`
- `ENABLE_AA1_BAIDU_HOT_SEARCH`
- `ENABLE_WEIBO_REALTIME_MULTI_SEARCH`
- `ENABLE_ZHIHU_HOT_SEARCH`
- `ENABLE_BILIBILI_POPULAR_HOT`
- `ENABLE_TOUTIAO_HOT_BOARD`
- `ENABLE_TRENDRADAR_SOURCES`
- `ENABLE_ENTOBIT_HOT_SEARCH`

### 自动生包与发布

- `AUTO_GENERATE_CONTENT_PACKS`
- `AUTO_GENERATE_RECOMMENDED_ACTIONS`
- `AUTO_GENERATE_MAX_PACKS`
- `PUBLISH_RUNNER_SECRET`
- `PUBLISH_RUN_URL`
- `PUBLISH_RUN_BATCH_SIZE`
- `PUBLISH_SIM_FAIL_RATE`

完整变量请看 [`.env.example`](.env.example)。

## 数据与初始化

数据库与种子文件：

- [`db/schema.sql`](db/schema.sql)
- [`db/seed.sql`](db/seed.sql)

初始化顺序：

1. 在 Supabase SQL Editor 执行 `db/schema.sql`
2. 再执行 `db/seed.sql`
3. 配置 `.env.local`
4. 启动应用

如果数据库未接好，系统会自动回退到本地 mock/runtime 数据。

## Docker 部署

相关文件：

- [`Dockerfile`](Dockerfile)
- [`compose.yaml`](compose.yaml)

如果你只想快速用容器跑起来，最简单的是直接用 `docker build` + `docker run`：

```bash
docker build -t brand-hotspot-studio .

docker run -d \
  --name brand-hotspot-studio \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.local \
  brand-hotspot-studio
```

如果你要自己接管持久化目录，可以额外挂载运行时目录：

```bash
docker run -d \
  --name brand-hotspot-studio \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.local \
  -v "$(pwd)/data/runtime:/app/.runtime" \
  brand-hotspot-studio
```

`compose.yaml` 也可以继续用，但 README 这里不再绑定任何个人化部署环境说明。

## GitHub Actions 定时同步

仓库已包含：

- [`.github/workflows/hotspot-sync.yml`](.github/workflows/hotspot-sync.yml)

适合在 Vercel Hobby 这类环境中定时调用线上同步接口。

需要在 GitHub 仓库里配置：

- `HOTSPOT_SYNC_SECRET`

## 相关文档

- [`docs/plans/2026-03-24-source-first-ai-内容生产蓝图.md`](docs/plans/2026-03-24-source-first-ai-内容生产蓝图.md)
- [`docs/plans/2026-03-24-production-studio-staged-generation-plan.md`](docs/plans/2026-03-24-production-studio-staged-generation-plan.md)
- [`docs/plans/2026-03-23-one-click-production-workbench-plan.md`](docs/plans/2026-03-23-one-click-production-workbench-plan.md)
- [`docs/plans/2026-03-22-account-access-design.md`](docs/plans/2026-03-22-account-access-design.md)

如果你要对外讲给客户看，也可以直接参考这份销售物料：

- [`docs/销售物料/品牌客户讲解版-内容生产流程图.png`](docs/销售物料/品牌客户讲解版-内容生产流程图.png)

## 当前边界

这版仓库已经能把“品牌资料 -> 热点 -> 审核 -> 制作 -> 发布”串成一个工作流，但还有一些能力仍处在首版阶段：

- 制作工作台当前以图文成稿为主，视频链路还不是交付重点
- 发布执行器仍以模拟/联调为主，不是完整真实代发系统
- Source-First AI 已经进入主设计方向，但部分旧链路仍在并行存在
- 多组织权限、平台后台、邀请和审计能力已经补起来，但还可以继续细化

如果你现在打开仓库，这个 README 应该代表的是“最新版产品说明”，而不是最早那版热点快反 Demo。
