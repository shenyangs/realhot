# 今晚双线冲刺计划（用户体系 + 多模态内容工厂）

日期：2026-03-22

## 1. 今晚目标

本次不再只补“账号体系”，而是并行推进两条主线：

1. 用户体系硬化：把认证、授权、workspace 隔离从“有骨架”做到“能抗上线风险”。
2. 多模态生产升级：把“文案生成”升级到“图文 + 视频 + 字幕 + 口播 + 画面”自动化生产。

今晚的成功标准：

- 核心业务 API 都有后端鉴权，不再靠前端按钮隐藏。
- 数据读写和当前 workspace 绑定，不再默认读第一条数据。
- 能从一个热点任务，自动产出：
  - 图文素材（封面/配图）
  - 视频草片（含音频）
  - 口播音轨
  - 字幕文件（SRT）
  - 可发布预览包（JSON + 媒体 URL）

## 2. 关键现状（按当前代码）

1. 权限函数已定义，但动作层接入不足。
2. 多个内容 API 无登录态和角色校验。
3. 数据层未严格按当前 workspace 过滤。
4. `publish_jobs` 的写入与 schema 存在字段不一致风险（`workspace_id`）。
5. 内容生成以文本为主，缺少统一多模态编排器。

## 3. 多模态供应商策略（推荐）

## 3.1 推荐主策略（质量优先）

- 文本策划/脚本：继续用 Gemini（你已配置 API，直接复用）。
- 图片生成主通道：OpenAI `gpt-image-1.5`。
- 视频生成主通道：OpenAI `sora-2-pro`。
- 视频备份通道：Google Veo 3.1（Vertex AI / Gemini API 路径）。
- 口播与字幕：
  - 口播优先：OpenAI `gpt-4o-mini-tts`（可控音色、语气）
  - 字幕优先：OpenAI `gpt-4o-transcribe` / `gpt-4o-transcribe-diarize`

推荐原因：

- OpenAI 官方文档对图像和视频都给了较完整 API 面（生成、编辑、轮询、下载）与可控参数，适合快速工程化接入。
- Veo 3.1 具备强视频能力和音频输出，适合作为高可用备份通道，避免单供应商故障。

## 3.2 备选策略（单供应商优先）

- 全量 Google 栈：Gemini + Imagen 4 + Veo 3.1 + Gemini TTS。

优点：账单和平台统一。
缺点：部分特性仍有 Preview 属性或区域/配额限制，需要更强的降级设计。

## 4. 多模态能力定义（你提到的“自动配齐”）

每个“选题任务”新增一个 `Multimodal Pack` 产物，最少包含：

1. `storyline`：镜头脚本（按秒分段、每段目标情绪、平台适配）。
2. `image_set`：封面 + 插图 + 视频参考首帧。
3. `video_cut`：横版和竖版各 1 条（可先 8s/16s）。
4. `voice_track`：口播音轨（不同语速和语气版本）。
5. `subtitle_track`：SRT/VTT 字幕（带时间戳）。
6. `publish_bundle`：结构化导出（标题、正文、封面、视频、口播、字幕）。

“自动配字幕/口播/画面”链路：

1. Gemini 生成脚本 + 分镜 + 时间预算。
2. 图像模型生成关键画面（封面 + 参考帧）。
3. 视频模型按脚本生成镜头段并拼接。
4. TTS 生成口播音轨。
5. 对最终音轨跑 STT 生成时间戳字幕。
6. ffmpeg 合成预览成片（可选烧录字幕与封面片头）。

## 5. 今晚执行块（8-10 小时）

## Block 0（20 分钟）基线

- 建分支：`codex/auth-multimodal-hardening`
- 跑 `npm run typecheck`，记录现状。

验收：基线可复现。

## Block 1（70 分钟）统一鉴权

- 新增 auth guard helper（登录、workspace、角色）。
- 页面保护：`/brands` `/hotspots` `/review` `/publish` `/onboarding`。
- 核心写 API 接后端鉴权。

验收：未登录 401/跳转，越权 403。

## Block 2（90 分钟）workspace 强隔离

- 数据层查询与写入统一绑定 `currentWorkspace`。
- 修正 `publish_jobs.workspace_id` 写入。
- 移除“默认第一条 workspace/brand”逻辑。

验收：切 workspace 后数据正确隔离。

## Block 3（60 分钟）注册/邀请闭环

- Supabase 注册成功后设置 session cookie。
- 注册后按 workspace 数量跳转 `/` 或 `/select-workspace`。

验收：新用户注册后可直接进入可用会话。

## Block 4（90 分钟）多模态数据模型

新增（建议）：

- `multimodal_packs`
- `multimodal_assets`
- `multimodal_render_jobs`
- `subtitle_tracks`
- `voice_tracks`

并补 repository 层 CRUD 与状态流转。

验收：可为一个 pack 创建完整多模态任务记录。

## Block 5（120 分钟）Provider Adapter 层

新增统一接口：

- `imageProvider.generate()`
- `videoProvider.generate()/poll()/download()`
- `ttsProvider.synthesize()`
- `sttProvider.transcribe()`

首版落地：

- OpenAI：Image + Video + TTS + STT
- Google：Imagen + Veo 作为 fallback

验收：每类 provider 至少打通 1 条 happy path。

## Block 6（90 分钟）自动生产编排器

新增 `multimodal-orchestrator`：

1. 读热点包
2. 生成脚本分镜
3. 调图片/视频
4. 调口播
5. 生成字幕
6. 组装 publish bundle

验收：输入一个 packId，输出完整 `Multimodal Pack`。

## Block 7（60 分钟）发布预览接入

- 在 `/review` 或 `/publish` 增加“生成图文+视频包”动作。
- 展示：封面图、视频、口播音频、字幕下载。

验收：用户可在页面直接查看和下载多模态产物。

## Block 8（50 分钟）回归与文档

- 跑 `npm run typecheck` + `npm run lint`
- 手测主路径：
  1. 登录
  2. 切 workspace
  3. 生成文本包
  4. 生成多模态包
  5. 审核通过 + 发布队列

验收：无阻塞错误，链路可演示。

## 6. 今晚不做（控制范围）

1. 全量 RLS 一步到位。
2. 大规模 UI 重构。
3. 一次性接入过多供应商（先 2 主 1 备）。

## 7. 关键风险与应对

1. 视频生成耗时长：
   - 采用异步作业 + 轮询/回调 + 可重试。
2. 模型不稳定或限流：
   - Provider fallback（OpenAI <-> Google）。
3. 成本不可控：
   - 增加分辨率/时长上限，先默认低成本档。
4. 合规与内容审核：
   - 保留 provider 安全错误透传，增加审核前拦截状态。

## 8. API 与模块落地建议（代码结构）

建议新增：

- `lib/services/multimodal-orchestrator.ts`
- `lib/services/providers/image/openai-image.ts`
- `lib/services/providers/image/google-imagen.ts`
- `lib/services/providers/video/openai-sora.ts`
- `lib/services/providers/video/google-veo.ts`
- `lib/services/providers/audio/openai-tts.ts`
- `lib/services/providers/audio/openai-stt.ts`
- `app/api/multimodal/generate/route.ts`
- `app/api/multimodal/jobs/[jobId]/route.ts`

## 9. 外部能力依据（2026-03-22 核对）

说明：以下是基于官方文档的能力依据；“最佳”是结合质量、可控性、API 完整度后的工程判断。

- OpenAI Image：`gpt-image-1.5` 被标注为 GPT Image 家族的高质量主力模型。
- OpenAI Video：Sora 视频 API 已提供创建、轮询、下载、扩展与编辑流程。
- OpenAI TTS/STT：`gpt-4o-mini-tts`、`gpt-4o-transcribe`、`gpt-4o-transcribe-diarize` 可用于口播与字幕。
- Google Imagen：Imagen 4 系列（standard/ultra/fast）可用于高质量图像生成。
- Google Veo：Veo 3.1 在 Vertex AI 文档中明确支持文本/图像到视频、扩展、插入/移除对象，并支持音频对话。

## 10. 新增计划入口（一键制作 + 最终内容工作台）

你新增的需求已拆成独立执行文档：

- [2026-03-23-one-click-production-workbench-plan.md](2026-03-23-one-click-production-workbench-plan.md)

建议排期：

1. 先完成本计划的 Block 0-8（用户体系硬化 + 多模态基础能力）。
2. 再接新文档的 Block 9-12（“选题通过 -> 一键制作 -> 最终工作台 -> 发布出口”闭环）。

## 11. 收尾计划（本地保存 + 更新 GitHub）

全部开发与联调完成后，统一执行以下收尾流程：

1. 本地保存与校验
   - 跑 `npm run typecheck` 与 `npm run lint`
   - 确认 `.env.local`、密钥文件、运行缓存未被误提交
   - 生成最终变更清单（模块、路由、数据表、环境变量）
2. 本地提交规范
   - 按功能分 2-4 个 commit（鉴权隔离、多模态引擎、工作台、文档）
   - 每个 commit message 使用“动词 + 范围”格式，便于回滚
3. 推送到 GitHub
   - 推送分支：`git push -u origin <feature-branch>`
   - 创建 PR，附上：
     - 背景与目标
     - 风险点
     - 测试结果
     - 回滚方案
4. 合并后落盘归档
   - 拉取主干并打本地标签（可选）：`git tag -a v0.x.x -m \"...\"`
   - 导出一份发布说明到 `docs/`（含已知限制与后续计划）

收尾验收标准：

1. 本地工作区干净（仅保留预期变更）。
2. GitHub 上有完整 PR 与可追踪提交。
3. 文档、代码、数据库变更说明一致。
