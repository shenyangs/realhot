# 一键制作与最终内容工作台计划

日期：2026-03-23

## 1. 目标

在“选题方向通过”后，增加一个 `一键制作` 按钮，自动调用多类 AI 能力生成传播内容，并提供一个新的“最终内容工作台”用于统一微调、替换和导出。

核心体验：

1. 通过审核后，用户点击一次按钮即可进入自动生产流程。
2. 系统自动完成图文、视频、口播、字幕的首版生成。
3. 用户在新页面完成最终调整，再导出或入发布队列。

## 2. 适用时机与入口

触发条件（建议首版）：

1. `hotspot_pack.status = approved`
2. 当前用户角色为 `org_admin` 或 `approver`

入口位置：

1. `/review` 的已通过卡片区增加 `一键制作` 按钮
2. `/publish` 的待发布区增加 `一键制作` 按钮

## 3. 三种实现方案

### 方案 A：同步串行（最快可上线）

按钮点击后同步等待整条链路结束再返回结果。

优点：实现简单。
缺点：请求超时风险高，视频阶段慢时体验差。

### 方案 B：异步作业（推荐）

按钮创建作业后立即返回，前端跳转到工作台看实时进度，分阶段刷新结果。

优点：稳定、可重试、适合视频耗时任务。
缺点：需要作业状态机和轮询。

### 方案 C：半自动向导

先生成脚本，再让用户点“继续生成视频/口播/字幕”。

优点：更可控、成本可控。
缺点：不是严格“一键”。

推荐：先上 `方案 B`，同时保留“阶段重跑”能力。

## 4. 新页面设计：最终内容工作台

页面建议：`/production-studio/[packId]`

布局建议：

1. 左侧：素材树（封面、配图、视频、口播、字幕）
2. 中间：主预览区（图文预览/视频播放器）
3. 右侧：参数与操作区（prompt、音色、字幕样式、重生按钮）

页面能力：

1. 图文块：改标题、改正文、替换图片、重生图片
2. 视频块：切版本、重生镜头、替换口播、重跑字幕
3. 字幕块：在线编辑 SRT，支持一键重新对齐时间轴
4. 质检块：敏感词、长度、平台规范、封面可读性
5. 出口块：导出包、提交发布队列

## 5. 一键制作编排链路

`一键制作` 后按以下步骤异步执行：

1. 读取 `hotspot_pack` 与品牌策略上下文
2. 生成传播脚本（平台分版 + 分镜 + 口播稿）
3. 生成图像资产（封面、插图、视频首帧参考）
4. 生成视频资产（横版 + 竖版）
5. 生成口播音轨（可多音色）
6. 语音转字幕（SRT/VTT）
7. 合成预览版并写入发布包
8. 回写状态为 `ready_for_finalize`

## 6. 数据模型增量

建议新增：

1. `production_jobs`
2. `production_assets`
3. `production_versions`
4. `production_subtitles`
5. `production_voice_tracks`

关键字段建议：

1. `workspace_id`
2. `pack_id`
3. `status`：`queued/running/needs-review/completed/failed`
4. `stage`：`script/image/video/voice/subtitle/finalize`
5. `provider`、`model`
6. `error_message`、`retry_count`

## 7. API 设计

新增接口（建议）：

1. `POST /api/production/one-click`
2. `GET /api/production/jobs/:jobId`
3. `POST /api/production/jobs/:jobId/retry`
4. `PATCH /api/production/assets/:assetId`
5. `POST /api/production/assets/:assetId/regenerate`
6. `POST /api/production/packs/:packId/publish-bundle`

## 8. 今晚可执行拆解（新增 Block）

## Block 9（60-80 分钟）一键制作主流程骨架

1. 加按钮与权限校验
2. 创建 `production_job`
3. 跳转到 `/production-studio/[packId]`

验收：

1. 已通过选题可触发
2. 作业能入库并可查询状态

## Block 10（90-120 分钟）工作台页面首版

1. 实现三栏布局
2. 接入作业状态与素材列表
3. 支持最小编辑（标题、正文、字幕文本）

验收：

1. 用户可看到自动生成结果
2. 至少能修改文本并保存版本

## Block 11（90 分钟）重生与重跑能力

1. `重生图片`
2. `重生视频`
3. `重跑口播+字幕`

验收：

1. 每个重生动作有独立状态
2. 不影响其他已完成资产

## Block 12（45-60 分钟）最终出口闭环

1. 导出 `publish_bundle`
2. 一键推送到现有发布队列

验收：

1. 导出内容可下载
2. 发布队列可看到新产物

## Block 13（30-45 分钟）本地保存与 GitHub 同步

1. 本地保存
   - 跑 `npm run typecheck` + `npm run lint`
   - 确认只提交业务代码与计划文档
2. 提交与推送
   - 按“工作台/编排器/API/文档”拆分 commit
   - 推送当前功能分支到 GitHub
3. PR 与交付记录
   - 创建 PR，附测试截图与手测清单
   - 标明已知问题、风险与回滚步骤

验收：

1. 本地分支可复现并可回滚。
2. GitHub 有完整 PR 与变更说明。
3. 团队可按 PR 直接继续开发或发布。

## 9. 状态机建议

作业主状态：

1. `queued`
2. `running`
3. `needs-review`
4. `completed`
5. `failed`

阶段状态（每阶段独立）：

1. `pending`
2. `processing`
3. `done`
4. `failed`
5. `skipped`

## 10. 验收标准（业务视角）

1. 审核通过后，确实出现 `一键制作`。
2. 点击后 3 秒内进入工作台并看到进度状态。
3. 生成完成后，页面可预览图文 + 视频 + 音频 + 字幕。
4. 用户可至少修改 3 类内容（文案、字幕、封面图）。
5. 修改后的结果可导出并进入发布链路。
6. 最终代码和文档已同步到 GitHub 并可追溯。
