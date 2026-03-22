"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ProductionAsset, ProductionDraft, ProductionJob, ProductionJobStage } from "@/lib/domain/types";

interface ProductionStudioConsoleProps {
  packId: string;
  initialJob: ProductionJob | null;
  initialAssets: ProductionAsset[];
  initialDraft: ProductionDraft | null;
  initialTitle: string;
  initialBody: string;
}

function pickAsset(assets: ProductionAsset[], kind: ProductionAsset["kind"]) {
  return assets.find((asset) => asset.kind === kind);
}

function isLikelyVideoUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.endsWith(".mp4") || normalized.endsWith(".mov") || normalized.includes("video");
}

export function ProductionStudioConsole({
  packId,
  initialJob,
  initialAssets,
  initialDraft,
  initialTitle,
  initialBody
}: ProductionStudioConsoleProps) {
  const [job, setJob] = useState(initialJob);
  const [assets, setAssets] = useState<ProductionAsset[]>(initialAssets);
  const [draft, setDraft] = useState<ProductionDraft | null>(initialDraft);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const storageKey = useMemo(() => `signalstack:production:${packId}`, [packId]);
  const [title, setTitle] = useState(initialDraft?.title ?? initialTitle);
  const [body, setBody] = useState(initialDraft?.body ?? initialBody);
  const [subtitles, setSubtitles] = useState(
    initialDraft?.subtitles ??
      [
        "1",
        "00:00:00,000 --> 00:00:03,500",
        "这里是自动生成字幕草稿，后续会替换为真实时间轴。",
        "",
        "2",
        "00:00:03,500 --> 00:00:07,000",
        "你可以在这里直接微调字幕内容。"
      ].join("\n")
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(initialDraft?.updatedAt ?? "");

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        title?: string;
        body?: string;
        subtitles?: string;
        updatedAt?: string;
      };
      setTitle(parsed.title ?? initialDraft?.title ?? initialTitle);
      setBody(parsed.body ?? initialDraft?.body ?? initialBody);
      setSubtitles(parsed.subtitles ?? initialDraft?.subtitles ?? subtitles);
      setLastSavedAt(parsed.updatedAt ?? initialDraft?.updatedAt ?? "");
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBody, initialDraft, initialTitle, storageKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const payload = {
        title,
        body,
        subtitles,
        updatedAt: new Date().toISOString()
      };

      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(payload.updatedAt);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [body, storageKey, subtitles, title]);

  async function refreshJobDetail() {
    if (!job?.id) {
      setMessage("当前还没有可刷新的一键制作作业。");
      return;
    }

    const response = await fetch(`/api/production/jobs/${job.id}`);
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      job?: ProductionJob;
      assets?: ProductionAsset[];
      draft?: ProductionDraft | null;
    };

    if (!response.ok || !payload.ok || !payload.job) {
      setMessage(payload.error ?? "刷新作业状态失败");
      return;
    }

    setJob(payload.job);
    setAssets(payload.assets ?? []);
    setDraft(payload.draft ?? null);

    if (payload.draft) {
      setTitle(payload.draft.title);
      setBody(payload.draft.body);
      setSubtitles(payload.draft.subtitles);
      setLastSavedAt(payload.draft.updatedAt);
    }

    setMessage(`已刷新：${payload.job.status} / ${payload.job.stage}`);
  }

  function rerunStage(stage: ProductionJobStage | "retry") {
    if (!job?.id) {
      setMessage("当前还没有可重试的一键制作作业。");
      return;
    }

    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/production/jobs/${job.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          stage === "retry"
            ? { action: "retry" }
            : {
                action: "rerun_stage",
                stage
              }
        )
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        runError?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "重跑作业失败");
        return;
      }

      await refreshJobDetail();
      if (payload.runError) {
        setMessage(`作业完成但存在警告：${payload.runError}`);
      }
    });
  }

  function saveDraftToServer() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/production/packs/${packId}/draft`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          body,
          subtitles,
          coverAssetId: pickAsset(assets, "image")?.id,
          videoAssetId: pickAsset(assets, "video")?.id,
          voiceAssetId: pickAsset(assets, "voice")?.id
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        draft?: ProductionDraft;
      };

      if (!response.ok || !payload.ok || !payload.draft) {
        setMessage(payload.error ?? "保存草稿失败");
        return;
      }

      setDraft(payload.draft);
      setLastSavedAt(payload.draft.updatedAt);
      setMessage("已保存到服务器草稿");
    });
  }

  function exportBundle(queue: boolean) {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/production/packs/${packId}/publish-bundle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          queue
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        bundle?: Record<string, unknown>;
      };

      if (!response.ok || !payload.ok || !payload.bundle) {
        setMessage(payload.error ?? "导出发布包失败");
        return;
      }

      const blob = new Blob([JSON.stringify(payload.bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `production-bundle-${packId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      setMessage(queue ? "已导出发布包，并推送到发布队列" : "已导出发布包");
    });
  }

  const scriptAsset = pickAsset(assets, "script");
  const imageAsset = pickAsset(assets, "image");
  const videoAsset = pickAsset(assets, "video");
  const voiceAsset = pickAsset(assets, "voice");
  const subtitleAsset = pickAsset(assets, "subtitle");

  return (
    <section className="panel">
      <div className="panelHeader sectionTitle">
        <div>
          <p className="eyebrow">Final Console</p>
          <h3>最终内容调整</h3>
        </div>
        <span className="pill pill-neutral">{job ? `${job.status} / ${job.stage}` : "未触发作业"}</span>
      </div>

      <div className="inlineActions">
        <button className="buttonLike subtleButton" disabled={isPending} onClick={() => void refreshJobDetail()} type="button">
          刷新作业状态
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("retry")} type="button">
          全链路重跑
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("image")} type="button">
          重生图片
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("video")} type="button">
          重生视频
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("voice")} type="button">
          重跑口播+字幕
        </button>
      </div>

      <div className="brandInfoGrid">
        <article className="subPanel">
          <strong>图文预览</strong>
          {imageAsset?.previewUrl ? <img alt="封面预览" src={imageAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} /> : null}
          <p className="muted">{imageAsset?.textContent ?? "暂无图像资产"}</p>
        </article>

        <article className="subPanel">
          <strong>视频预览</strong>
          {videoAsset?.previewUrl ? (
            isLikelyVideoUrl(videoAsset.previewUrl) ? (
              <video controls playsInline src={videoAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} />
            ) : (
              <img alt="视频预览" src={videoAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} />
            )
          ) : null}
          <p className="muted">{videoAsset?.textContent?.slice(0, 120) ?? "暂无视频资产"}</p>
        </article>
      </div>

      <div className="stack">
        <label className="field">
          <span>最终标题</span>
          <input onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label className="field">
          <span>最终正文</span>
          <textarea onChange={(event) => setBody(event.target.value)} rows={10} value={body} />
        </label>
        <label className="field">
          <span>字幕草稿（SRT）</span>
          <textarea onChange={(event) => setSubtitles(event.target.value)} rows={10} value={subtitles} />
        </label>
      </div>

      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} onClick={saveDraftToServer} type="button">
          保存最终草稿
        </button>
        <button className="buttonLike subtleButton" disabled={isPending} onClick={() => exportBundle(false)} type="button">
          导出发布包
        </button>
        <button className="buttonLike subtleButton" disabled={isPending} onClick={() => exportBundle(true)} type="button">
          导出并入发布队列
        </button>
      </div>

      <div className="definitionList compactDefinitionList">
        <div>
          <span>脚本资产</span>
          <strong>{scriptAsset ? "已生成" : "未生成"}</strong>
        </div>
        <div>
          <span>口播资产</span>
          <strong>{voiceAsset ? "已生成" : "未生成"}</strong>
        </div>
        <div>
          <span>字幕资产</span>
          <strong>{subtitleAsset ? "已生成" : "未生成"}</strong>
        </div>
        <div>
          <span>草稿状态</span>
          <strong>{draft ? "已保存" : "未保存"}</strong>
        </div>
      </div>

      <p className="muted">
        {lastSavedAt ? `本地自动保存时间：${new Date(lastSavedAt).toLocaleString("zh-CN")}` : "自动保存将在输入后触发。"}
      </p>
      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}
