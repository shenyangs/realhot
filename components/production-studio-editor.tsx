"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { AiProvider } from "@/lib/domain/ai-routing";
import type { ProductionJobRecord } from "@/lib/services/production-studio";

type ProductionJobType = "article" | "video" | "one_click";

const providerLabels: Record<AiProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax M2.7"
};

const jobTypeLabels: Record<ProductionJobType, string> = {
  article: "图文",
  video: "视频",
  one_click: "图文+视频"
};

function isAiProvider(value: string | null | undefined): value is AiProvider {
  return value === "gemini" || value === "minimax";
}

function resolveSelectedProvider(job: ProductionJobRecord | null, fallback: AiProvider) {
  if (isAiProvider(job?.route.requestedProvider)) {
    return job.route.requestedProvider;
  }

  if (isAiProvider(job?.route.effectiveProvider)) {
    return job.route.effectiveProvider;
  }

  return fallback;
}

function stageStatusLabel(status: "pending" | "processing" | "done" | "failed") {
  if (status === "done") {
    return "完成";
  }

  if (status === "processing") {
    return "进行中";
  }

  if (status === "failed") {
    return "失败";
  }

  return "待执行";
}

function stageTone(status: "pending" | "processing" | "done" | "failed") {
  if (status === "done") {
    return "positive";
  }

  if (status === "failed") {
    return "warning";
  }

  return "neutral";
}

export function ProductionStudioEditor({
  packId,
  initialJob,
  canRun,
  defaultProvider = "minimax",
  defaultModel: _defaultModel
}: {
  packId: string;
  initialJob: ProductionJobRecord | null;
  canRun: boolean;
  defaultProvider?: AiProvider;
  defaultModel?: string;
}) {
  const router = useRouter();
  const [articleTitle, setArticleTitle] = useState(initialJob?.outputs.articleTitle ?? "");
  const [articleBody, setArticleBody] = useState(initialJob?.outputs.articleBody ?? "");
  const [videoScript, setVideoScript] = useState(initialJob?.outputs.videoScript ?? "");
  const [voiceoverText, setVoiceoverText] = useState(initialJob?.outputs.voiceoverText ?? "");
  const [subtitleSrt, setSubtitleSrt] = useState(initialJob?.outputs.subtitleSrt ?? "");
  const [provider, setProvider] = useState<AiProvider>(resolveSelectedProvider(initialJob, defaultProvider));
  const [imageProvider, setImageProvider] = useState<AiProvider>("minimax");
  const [videoProvider, setVideoProvider] = useState<AiProvider>("minimax");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingJobType, setPendingJobType] = useState<ProductionJobType | null>(null);

  useEffect(() => {
    setArticleTitle(initialJob?.outputs.articleTitle ?? "");
    setArticleBody(initialJob?.outputs.articleBody ?? "");
    setVideoScript(initialJob?.outputs.videoScript ?? "");
    setVoiceoverText(initialJob?.outputs.voiceoverText ?? "");
    setSubtitleSrt(initialJob?.outputs.subtitleSrt ?? "");
    setProvider(resolveSelectedProvider(initialJob, defaultProvider));
    setImageProvider("minimax");
    setVideoProvider("minimax");
  }, [defaultProvider, initialJob]);

  function runProduction(jobType: ProductionJobType) {
    if (!canRun) {
      setMessage("当前选题还未审核通过，不能执行一键制作。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        setPendingJobType(jobType);

        const response = await fetch("/api/production/one-click", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            packId,
            jobType,
            provider,
            imageProvider,
            videoProvider
          })
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          job?: {
            route?: {
              effectiveProvider?: string;
              effectiveModel?: string;
            };
          };
        } | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "一键制作失败");
          return;
        }

        const effectiveProvider = payload?.job?.route?.effectiveProvider;
        const providerLabel = isAiProvider(effectiveProvider) ? providerLabels[effectiveProvider] : providerLabels[provider];

        setMessage(
          `已完成${jobTypeLabels[jobType]}制作，脚本使用${providerLabel}，图片策划使用${providerLabels[imageProvider]}，视频策划使用${providerLabels[videoProvider]}。`
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "一键制作请求失败，请稍后重试。");
      } finally {
        setPendingJobType(null);
      }
    });
  }

  function saveDraft() {
    if (!initialJob) {
      setMessage("请先执行一键制作，再保存编辑内容。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");

        const response = await fetch(`/api/production/packs/${packId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            articleTitle,
            articleBody,
            videoScript,
            voiceoverText,
            subtitleSrt
          })
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "保存失败");
          return;
        }

        setMessage("已保存到最终热点运营平台。\n你可以继续微调后再推入发布队列。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存请求失败，请稍后重试。");
      }
    });
  }

  function pushToPublishQueue() {
    if (!initialJob) {
      setMessage("请先执行一键制作，再推入发布队列。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");

        const response = await fetch(`/api/production/packs/${packId}/publish-bundle`, {
          method: "POST"
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          queuedCount?: number;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "推入发布队列失败");
          return;
        }

        setMessage(`已推入发布队列，共 ${payload.queuedCount ?? 0} 条任务。`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "推入发布队列请求失败，请稍后重试。");
      }
    });
  }

  return (
    <div className="productionStudioStack">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">制作状态</p>
            <h3>图文 + 视频 一键流程</h3>
          </div>
        </div>

        {initialJob ? (
          <>
            <div className="productionStageGrid">
              {initialJob.stages.map((stage) => (
                <article className="productionStageCard" key={stage.key}>
                  <div className="listItem">
                    <strong>{stage.label}</strong>
                    <span className={`pill pill-${stageTone(stage.status)}`}>{stageStatusLabel(stage.status)}</span>
                  </div>
                  <p className="muted">智能执行阶段</p>
                  <p className="muted">{stage.note}</p>
                </article>
              ))}
            </div>

            <p className="muted">
              第 {initialJob.runCount} 次制作 · 任务 {jobTypeLabels[initialJob.jobType]} · 模式 {initialJob.mode} · 更新时间{" "}
              {new Date(initialJob.updatedAt).toLocaleString("zh-CN")}
            </p>
          </>
        ) : (
          <p className="muted">当前还没有制作结果。点击下方按钮即可生成图文/视频/字幕/口播首版。</p>
        )}

        <label className="field fieldCompact">
          <span>本次制作引擎</span>
          <select
            disabled={isPending || !canRun}
            onChange={(event) => setProvider(event.target.value as AiProvider)}
            value={provider}
          >
            <option value="minimax">引擎 A（默认）</option>
            <option value="gemini">引擎 B</option>
          </select>
          <span className="muted">
            将使用 {providerLabels[provider]}，系统会自动选择具体模型。
          </span>
        </label>

        <label className="field fieldCompact">
          <span>图片策划模型</span>
          <select
            disabled={isPending || !canRun}
            onChange={(event) => setImageProvider(event.target.value as AiProvider)}
            value={imageProvider}
          >
            <option value="minimax">MiniMax M2.7（默认）</option>
            <option value="gemini">Gemini</option>
          </select>
          <span className="muted">只影响图片提示词规划，实际生图引擎保持不变。</span>
        </label>

        <label className="field fieldCompact">
          <span>视频策划模型</span>
          <select
            disabled={isPending || !canRun}
            onChange={(event) => setVideoProvider(event.target.value as AiProvider)}
            value={videoProvider}
          >
            <option value="minimax">MiniMax M2.7（默认）</option>
            <option value="gemini">Gemini</option>
          </select>
          <span className="muted">只影响视频提示词规划，实际生视频引擎保持不变。</span>
        </label>

        <div className="buttonRow">
          <button disabled={isPending || !canRun} onClick={() => runProduction("article")} type="button">
            {isPending && pendingJobType === "article" ? "执行中..." : initialJob ? "重新生成图文" : "生成图文"}
          </button>
          <button
            className="buttonLike subtleButton"
            disabled={isPending || !canRun}
            onClick={() => runProduction("video")}
            type="button"
          >
            {isPending && pendingJobType === "video" ? "执行中..." : initialJob ? "重新生成视频" : "生成视频"}
          </button>
          <button
            className="buttonLike subtleButton"
            disabled={isPending || !canRun}
            onClick={() => runProduction("one_click")}
            type="button"
          >
            {isPending && pendingJobType === "one_click" ? "执行中..." : initialJob ? "重新一键全做" : "一键全做"}
          </button>
          <button disabled={isPending || !initialJob} onClick={saveDraft} type="button">
            保存当前修改
          </button>
          <button disabled={isPending || !initialJob} onClick={pushToPublishQueue} type="button">
            推入发布队列
          </button>
        </div>

        {message ? <p className="muted">{message}</p> : null}
      </section>

      {initialJob ? (
        <>
          <section className="panel productionPreviewGrid">
            <article className="productionPreviewCard">
              <p className="eyebrow">封面预览（占位）</p>
              <img alt="封面预览" src={initialJob.outputs.imagePreviewUrl} />
            </article>

            <article className="productionPreviewCard">
              <p className="eyebrow">视频预览（占位）</p>
              <video controls preload="metadata" src={initialJob.outputs.videoPreviewUrl} />
            </article>

            <article className="productionPreviewCard">
              <p className="eyebrow">口播音轨（占位）</p>
              <audio controls preload="none" src={initialJob.outputs.audioPreviewUrl} />
            </article>
          </section>

          <section className="panel productionFormGrid">
            <label className="field">
              <span>图文标题</span>
              <input
                onChange={(event) => setArticleTitle(event.target.value)}
                value={articleTitle}
              />
            </label>

            <label className="field">
              <span>图文正文</span>
              <textarea
                onChange={(event) => setArticleBody(event.target.value)}
                rows={8}
                value={articleBody}
              />
            </label>

            <label className="field">
              <span>视频口播稿</span>
              <textarea
                onChange={(event) => setVideoScript(event.target.value)}
                rows={8}
                value={videoScript}
              />
            </label>

            <label className="field">
              <span>口播文案（TTS）</span>
              <textarea
                onChange={(event) => setVoiceoverText(event.target.value)}
                rows={6}
                value={voiceoverText}
              />
            </label>

            <label className="field">
              <span>SRT 字幕</span>
              <textarea
                onChange={(event) => setSubtitleSrt(event.target.value)}
                rows={10}
                value={subtitleSrt}
              />
            </label>
          </section>
        </>
      ) : null}
    </div>
  );
}
