"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ProductionJobRecord } from "@/lib/services/production-studio";

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
  canRun
}: {
  packId: string;
  initialJob: ProductionJobRecord | null;
  canRun: boolean;
}) {
  const router = useRouter();
  const [articleTitle, setArticleTitle] = useState(initialJob?.outputs.articleTitle ?? "");
  const [articleBody, setArticleBody] = useState(initialJob?.outputs.articleBody ?? "");
  const [videoScript, setVideoScript] = useState(initialJob?.outputs.videoScript ?? "");
  const [voiceoverText, setVoiceoverText] = useState(initialJob?.outputs.voiceoverText ?? "");
  const [subtitleSrt, setSubtitleSrt] = useState(initialJob?.outputs.subtitleSrt ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setArticleTitle(initialJob?.outputs.articleTitle ?? "");
    setArticleBody(initialJob?.outputs.articleBody ?? "");
    setVideoScript(initialJob?.outputs.videoScript ?? "");
    setVoiceoverText(initialJob?.outputs.voiceoverText ?? "");
    setSubtitleSrt(initialJob?.outputs.subtitleSrt ?? "");
  }, [initialJob?.id]);

  function runOneClick() {
    if (!canRun) {
      setMessage("当前选题还未审核通过，不能执行一键制作。");
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/production/one-click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ packId })
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "一键制作失败");
        return;
      }

      setMessage("已完成一键制作，页面已刷新。\n当前是可演示流程，后续可替换为真实生图/生视频接口。");
      router.refresh();
    });
  }

  function saveDraft() {
    if (!initialJob) {
      setMessage("请先执行一键制作，再保存编辑内容。");
      return;
    }

    startTransition(async () => {
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

      setMessage("已保存到最终内容工作台。\n你可以继续微调后再推入发布队列。");
      router.refresh();
    });
  }

  function pushToPublishQueue() {
    if (!initialJob) {
      setMessage("请先执行一键制作，再推入发布队列。");
      return;
    }

    startTransition(async () => {
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
                  <p className="muted">{stage.provider} · {stage.model}</p>
                  <p className="muted">{stage.note}</p>
                </article>
              ))}
            </div>

            <p className="muted">
              第 {initialJob.runCount} 次制作 · 模式 {initialJob.mode} · 更新时间 {new Date(initialJob.updatedAt).toLocaleString("zh-CN")}
            </p>
          </>
        ) : (
          <p className="muted">当前还没有制作结果。点击下方按钮即可生成图文/视频/字幕/口播首版。</p>
        )}

        <div className="buttonRow">
          <button disabled={isPending || !canRun} onClick={runOneClick} type="button">
            {isPending ? "执行中..." : initialJob ? "重新一键制作" : "一键制作图文+视频"}
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
