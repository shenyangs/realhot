# Brand Hotspot Studio

一个面向 AI、互联网、软件服务、SaaS 品牌团队的 Web SaaS 后台。首版聚焦这条链路：

- 实时监测行业热点和部分大众热点
- 根据品牌策略包评估相关性、行业重要性、速度和风险
- 自动生成每个热点的 `2 条快反 + 2 条观点` 内容包
- 按热点包进入人工审核
- 发布环节先保留导出和排期占位

## Stack

- Next.js App Router
- TypeScript
- Supabase schema 预置
- Gemini API 路由层，默认统一走 Google Gemini

## Core Screens

- `/` 总览台
- `/brands` 品牌策略包
- `/hotspots` 热点流
- `/review` 热点包审核台

## API

- `GET /api/health`
- `GET /api/hotspots`
- `GET /api/review`
- `POST /api/review/:packId`
- `POST /api/content-packs/generate`
- `GET /api/content-packs/:packId/export`
- `POST /api/hotspots/sync`
- `POST /api/publish/:packId/queue`
- `POST /api/publish/run`

## Local Run

1. 安装依赖：`npm install`
2. 复制环境变量：`cp .env.example .env.local`
3. 运行开发环境：`npm run dev`

如果没有配置 `GEMINI_API_KEY`，系统会自动退回到本地模板路由，方便先调通流程。

## Docker Deploy

- 多阶段镜像：`/Users/sam/Desktop/1st/Dockerfile`
- Compose：`/Users/sam/Desktop/1st/compose.yaml`
- 极空间环境变量模板：`/Users/sam/Desktop/1st/.env.zspace.example`
- 极空间 + 节点小宝部署步骤：`/Users/sam/Desktop/1st/docs/deploy-zspace.md`

快速开始：

```bash
cp .env.zspace.example .env.zspace
docker compose build
docker compose up -d
```

默认对外暴露 `3000` 端口，并把本地运行时数据持久化到 `./data/runtime`。

## Data Model

数据库 schema 在 [db/schema.sql](/Users/sam/Desktop/1st/db/schema.sql)。
初始化种子数据在 [db/seed.sql](/Users/sam/Desktop/1st/db/seed.sql)。

## Supabase Bootstrap

1. 在 Supabase SQL Editor 先执行 [db/schema.sql](/Users/sam/Desktop/1st/db/schema.sql)
2. 再执行 [db/seed.sql](/Users/sam/Desktop/1st/db/seed.sql)
3. 配置 `.env.local` 里的 Supabase 环境变量

如果 Supabase 没配置或库里没数据，代码会自动回退到 [lib/data/mock.ts](/Users/sam/Desktop/1st/lib/data/mock.ts)。

## GitHub Sync

首批真实热点源通过公开 RSS 接入，当前同步入口在 [app/api/hotspots/sync/route.ts](/Users/sam/Desktop/1st/app/api/hotspots/sync/route.ts)。

- `Google News / AI Agent`
- `Google News / SaaS & B2B`
- `Google News / Platform Signals`
- `Google News / Brand & Competitors`
- `AA1 / 百度热搜`
- `AA1 / 微博热搜`
- `Zhihu / Hot List`
- `Bilibili / Popular`
- `Toutiao / Hot Board`

同步服务会抓取公开新闻条目，按品牌主题、竞品命中、发布时间和风险词做基础打分，再把结果写入 `hotspots` 和 `hotspot_scores`。如果配置了 `HOTSPOT_SYNC_SECRET`，调用 `POST /api/hotspots/sync` 时需要带 `Authorization: Bearer <secret>` 或 `x-sync-secret`。

同步器会优先把“直连平台/API 信源”与“聚合型信源”一起拉取，再按标题进行跨源合并。若同一热点被多个来源同时命中，会在 `reasons` 中增加“多源交叉命中”提示，并给予轻微优先级加权。同步结果里的 `providers` 还会附带网页校验信息，例如页面是否可达、是否命中静态标题、是否被访客系统/门禁页拦截。

如果部署环境存在公司代理、自签名证书或本地证书链干预，Node 原生 `fetch` 可能报 TLS 证书错误。此时建议优先修正系统/运行时 CA 配置；仅在调试或内网验收阶段，才临时启用 `HOTSPOT_ALLOW_INSECURE_TLS=true` 作为兜底。

另外，`cnBeta RSS` 当前在部分环境下存在 DNS 不稳定问题，因此默认关闭，避免上线后长期出现 provider 失败噪音；需要时可显式设置 `ENABLE_RSS_CNBETA=true` 再启用。

### Experimental Aggregator Source

同步器现在也支持实验性自定义适配器源。当前已加上 `Entobit / 热搜神器 Pro` 的 spike 适配入口，但默认关闭，因为该站点使用未文档化私有接口，匿名服务端抓取是否稳定会受站点风控策略影响。

另外，当前代码也预留了 `TrendRadar/newsnow` 兼容接入层，适合作为中国本土平台热源的补充聚合层使用。建议优先使用你自部署或可控的 TrendRadar/newsnow 接口地址，再通过环境变量开启；公开默认地址可能会遇到 Cloudflare challenge 或地区网络差异，因此更适合做备用层，而不是唯一主源。

- `ENABLE_AUXILIARY_HOT_SOURCES=true`
- `ENABLE_AA1_BAIDU_HOT_SEARCH=true`
- `ENABLE_AA1_WEIBO_HOT_SEARCH=true`
- `ENABLE_ZHIHU_HOT_SEARCH=true`
- `ENABLE_BILIBILI_POPULAR_HOT=true`
- `ENABLE_TOUTIAO_HOT_BOARD=true`
- `AUXILIARY_HOT_SOURCE_MAX_ITEMS=10`
- `ENABLE_TRENDRADAR_SOURCES=true`
- `TRENDRADAR_BASE_URL=https://your-trendradar-or-newsnow.example.com/api/s`
- `TRENDRADAR_FALLBACK_ONLY=true`
- `TRENDRADAR_SOURCE_MAX_ITEMS=25`
- `ENABLE_ENTOBIT_HOT_SEARCH=true`
- `ENTOBIT_HOT_SEARCH_RANK_TYPES=realTimeHotSearchList,douyin,baidu,xiaohongshu`
- `ENTOBIT_HOT_SEARCH_MAX_ITEMS=10`

如果某个实验源抓不到数据，同步流程会继续跑其他源，不会阻塞主链路。当前正式部署策略不依赖本地浏览器渲染，而是优先使用公开 API、可直连页面校验和多源交叉合并。当前实测中，AA1 百度热搜、知乎热榜、B 站热门、头条热榜都可直接返回结构化数据；AA1 微博热搜存在返回空数组的情况，因此只作为补充信源；Entobit 也保持在“补充聚合信源”位置，而不是唯一来源。

同步结果里的 `providers` 现在会额外返回 `fetchStatus` 和 `fetchNote`，便于线上快速区分“抓取成功但为空”与“请求本身失败”。

默认情况下，同步完成后不会自动批量生成内容包。这样可以先让人看过题、或先让 Source-First AI 判断完，再决定是否进入生成。需要开启时可显式打开以下开关：

- `AUTO_GENERATE_CONTENT_PACKS`
- `AUTO_GENERATE_RECOMMENDED_ACTIONS`
- `AUTO_GENERATE_MAX_PACKS`
- `HOTSPOT_SOURCE_ENRICH_MAX_ITEMS`

### Manual Run

本地或服务器启动应用后，可以直接执行：

```bash
npm run sync:hotspots
```

它会调用 `APP_URL/api/hotspots/sync`。默认 `APP_URL` 是 `http://localhost:3000`，也可以单独指定 `HOTSPOT_SYNC_URL`。

### Cron Example

在 Linux 或 macOS 服务器上，可以用系统 `cron` 定时调用：

```cron
*/30 * * * * cd /path/to/brand-hotspot-studio && APP_URL=https://your-app.example.com HOTSPOT_SYNC_SECRET=your-secret npm run sync:hotspots >> /tmp/brand-hotspot-sync.log 2>&1
```

建议先从 `30 分钟一次` 开始，等真实噪音情况稳定后再调到 `10-15 分钟`。

### GitHub Actions 定时（适合 Vercel Hobby）

仓库已包含工作流：[.github/workflows/hotspot-sync.yml](/Users/sam/Desktop/1st/.github/workflows/hotspot-sync.yml)，默认每 30 分钟触发一次线上同步接口。

启用前请在 GitHub 仓库中配置 Secret：

- `HOTSPOT_SYNC_SECRET`：与线上 Vercel 环境变量 `HOTSPOT_SYNC_SECRET` 保持一致

路径：`GitHub Repo -> Settings -> Secrets and variables -> Actions -> New repository secret`

## Content Pack Generation

热点命中后，可以手动调用内容包生成入口：

```bash
curl -X POST http://localhost:3000/api/content-packs/generate \
  -H "Content-Type: application/json" \
  -d '{"hotspotId":"33333333-3333-3333-3333-333333333331"}'
```

当前实现会为单个热点生成固定 `2 条快反 + 2 条观点` 内容，并写入 `hotspot_packs` 和 `content_variants`。生成逻辑采用“模板生成为主，模型润色为辅”，默认符合中国企业传播语境。

## Publish and Export

审核台已经接入发布/导出链路：

- `GET /api/content-packs/:packId/export?format=markdown|json`
- `POST /api/publish/:packId/queue`
- `POST /api/publish/run`

`queue` 会把该热点包下所有内容按平台拆成发布任务写入 `publish_jobs`，默认状态 `queued`。

`run` 会消费 `queued` 任务并回写 `published/failed`（当前是模拟执行器，便于联调；后续可替换成平台真实代发实现）。

### Publish Runner

手动执行发布队列：

```bash
npm run run:publish
```

也可以直接调接口：

```bash
curl -X POST http://localhost:3000/api/publish/run \
  -H "Content-Type: application/json" \
  -d '{"packId":"44444444-4444-4444-4444-444444444441"}'
```

相关环境变量：

- `PUBLISH_RUNNER_SECRET`
- `PUBLISH_RUN_URL`
- `PUBLISH_RUN_BATCH_SIZE`
- `PUBLISH_SIM_FAIL_RATE`
