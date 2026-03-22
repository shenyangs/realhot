"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ProductionAsset, ProductionDraft, ProductionJob, ProductionJobStage } from "@/lib/domain/types";

interface ProductionStudioConsoleProps {
  packId: string;
  initialJob: ProductionJob | null;
  initialAssets: ProductionAsset[];
  initialDraft: ProductionDraft | null;
  initialTitle: string;
  initialBody: string;
}

function isLikelyVideoUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.endsWith(".mp4") || normalized.endsWith(".mov") || normalized.includes("video");
}

function pickPreferredAsset(assets: ProductionAsset[], preferredId?: string | null): ProductionAsset | null {
  if (preferredId) {
    const matched = assets.find((asset) => asset.id === preferredId);

    if (matched) {
      return matched;
    }
  }

  return assets[0] ?? null;
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
  const autoStartRef = useRef(false);
  const runnerKickRef = useRef(false);
  const storageKey = useMemo(() => `signalstack:production:${packId}`, [packId]);

  const imageAssets = useMemo(() => assets.filter((asset) => asset.kind === "image"), [assets]);
  const videoAssets = useMemo(() => assets.filter((asset) => asset.kind === "video"), [assets]);
  const voiceAssets = useMemo(() => assets.filter((asset) => asset.kind === "voice"), [assets]);
  const subtitleAssets = useMemo(() => assets.filter((asset) => asset.kind === "subtitle"), [assets]);
  const scriptAsset = useMemo(() => assets.find((asset) => asset.kind === "script") ?? null, [assets]);

  const [coverAssetId, setCoverAssetId] = useState<string>(
    initialDraft?.coverAssetId ?? initialAssets.find((asset) => asset.kind === "image")?.id ?? ""
  );
  const [videoAssetId, setVideoAssetId] = useState<string>(
    initialDraft?.videoAssetId ?? initialAssets.find((asset) => asset.kind === "video")?.id ?? ""
  );
  const [voiceAssetId, setVoiceAssetId] = useState<string>(
    initialDraft?.voiceAssetId ?? initialAssets.find((asset) => asset.kind === "voice")?.id ?? ""
  );
  const [subtitleAssetId, setSubtitleAssetId] = useState<string>(
    initialAssets.find((asset) => asset.kind === "subtitle")?.id ?? ""
  );
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
  const [coverImageUrl, setCoverImageUrl] = useState<string>(
    pickPreferredAsset(initialAssets.filter((asset) => asset.kind === "image"), initialDraft?.coverAssetId)?.previewUrl ?? ""
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>(initialDraft?.updatedAt ?? "");

  const selectedImageAsset = pickPreferredAsset(imageAssets, coverAssetId);
  const selectedVideoAsset = pickPreferredAsset(videoAssets, videoAssetId);
  const selectedVoiceAsset = pickPreferredAsset(voiceAssets, voiceAssetId);
  const selectedSubtitleAsset = pickPreferredAsset(subtitleAssets, subtitleAssetId);

  useEffect(() => {
    runnerKickRef.current = false;
  }, [job?.id]);

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
        coverAssetId?: string;
        videoAssetId?: string;
        voiceAssetId?: string;
        subtitleAssetId?: string;
        coverImageUrl?: string;
        updatedAt?: string;
      };

      setTitle(parsed.title ?? initialDraft?.title ?? initialTitle);
      setBody(parsed.body ?? initialDraft?.body ?? initialBody);
      setSubtitles(parsed.subtitles ?? initialDraft?.subtitles ?? subtitles);
      setCoverAssetId(parsed.coverAssetId ?? initialDraft?.coverAssetId ?? "");
      setVideoAssetId(parsed.videoAssetId ?? initialDraft?.videoAssetId ?? "");
      setVoiceAssetId(parsed.voiceAssetId ?? initialDraft?.voiceAssetId ?? "");
      setSubtitleAssetId(parsed.subtitleAssetId ?? initialAssets.find((asset) => asset.kind === "subtitle")?.id ?? "");
      setCoverImageUrl(parsed.coverImageUrl ?? "");
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
        coverAssetId,
        videoAssetId,
        voiceAssetId,
        subtitleAssetId,
        coverImageUrl,
        updatedAt: new Date().toISOString()
      };

      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(payload.updatedAt);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [body, coverAssetId, coverImageUrl, storageKey, subtitleAssetId, subtitles, title, videoAssetId, voiceAssetId]);

  useEffect(() => {
    if (!selectedImageAsset) {
      return;
    }

    setCoverImageUrl(selectedImageAsset.previewUrl ?? "");
  }, [selectedImageAsset?.id, selectedImageAsset?.previewUrl]);

  useEffect(() => {
    if (imageAssets.length > 0 && !imageAssets.some((asset) => asset.id === coverAssetId)) {
      setCoverAssetId(imageAssets[0].id);
    }
  }, [coverAssetId, imageAssets]);

  useEffect(() => {
    if (videoAssets.length > 0 && !videoAssets.some((asset) => asset.id === videoAssetId)) {
      setVideoAssetId(videoAssets[0].id);
    }
  }, [videoAssetId, videoAssets]);

  useEffect(() => {
    if (voiceAssets.length > 0 && !voiceAssets.some((asset) => asset.id === voiceAssetId)) {
      setVoiceAssetId(voiceAssets[0].id);
    }
  }, [voiceAssetId, voiceAssets]);

  useEffect(() => {
    if (subtitleAssets.length > 0 && !subtitleAssets.some((asset) => asset.id === subtitleAssetId)) {
      setSubtitleAssetId(subtitleAssets[0].id);
    }
  }, [subtitleAssetId, subtitleAssets]);

  async function refreshJobDetail(silent = false) {
    if (!job?.id) {
      if (!silent) {
        setMessage("当前还没有可刷新的一键制作作业。");
      }
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
      if (!silent) {
        setMessage(payload.error ?? "刷新作业状态失败");
      }
      return;
    }

    setJob(payload.job);
    setAssets(payload.assets ?? []);
    setDraft(payload.draft ?? null);

    if (payload.draft) {
      setTitle(payload.draft.title);
      setBody(payload.draft.body);
      setSubtitles(payload.draft.subtitles);
      setCoverAssetId(payload.draft.coverAssetId ?? "");
      setVideoAssetId(payload.draft.videoAssetId ?? "");
      setVoiceAssetId(payload.draft.voiceAssetId ?? "");
      setLastSavedAt(payload.draft.updatedAt);
    }

    if (!silent) {
      setMessage(`已刷新：${payload.job.status} / ${payload.job.stage}`);
    }
  }

  async function kickRunner(targetJobId: string) {
    await fetch("/api/production/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jobId: targetJobId,
        limit: 1
      })
    }).catch(() => null);
  }

  useEffect(() => {
    if (!job?.id || autoStartRef.current) {
      return;
    }

    if (job.status !== "queued") {
      return;
    }

    autoStartRef.current = true;

    startTransition(async () => {
      const response = await fetch(`/api/production/jobs/${job.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "start"
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        runError?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "启动一键制作失败");
        return;
      }

      await kickRunner(job.id);
      await refreshJobDetail(true);
      setMessage("一键制作已入队并启动执行");
    });
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job?.id) {
      return;
    }

    if (job.status === "queued" && !runnerKickRef.current) {
      runnerKickRef.current = true;
      void kickRunner(job.id);
    }

    if (job.status !== "queued" && job.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshJobDetail(true);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

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

      await refreshJobDetail(true);
      setMessage(payload.runError ? `作业完成但存在警告：${payload.runError}` : "阶段重跑完成");
    });
  }

  function regenerateAsset(asset: ProductionAsset | null, label: string) {
    if (!asset) {
      setMessage(`当前没有可${label}的资产`);
      return;
    }

    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/production/assets/${asset.id}/regenerate`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? `${label}失败`);
        return;
      }

      await refreshJobDetail(true);
      setMessage(`${label}完成`);
    });
  }

  function applyCoverImageUrl() {
    if (!selectedImageAsset?.id || !coverImageUrl.trim()) {
      setMessage("请先选择封面资产并填写 URL");
      return;
    }

    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/production/assets/${selectedImageAsset.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          previewUrl: coverImageUrl.trim()
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "替换封面失败");
        return;
      }

      await refreshJobDetail(true);
      setMessage("封面地址已更新");
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
          coverAssetId: coverAssetId || undefined,
          videoAssetId: videoAssetId || undefined,
          voiceAssetId: voiceAssetId || undefined
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
        qualityReport?: {
          score: number;
          passed: boolean;
          issues: Array<{ message: string; severity: string }>;
        };
      };

      if (!response.ok || !payload.ok || !payload.bundle) {
        if (payload.error === "quality_gate_blocked" && payload.qualityReport) {
          const topIssue = payload.qualityReport.issues[0]?.message ?? "请先处理质量问题";
          setMessage(`质量门禁未通过（${payload.qualityReport.score} 分）：${topIssue}`);
          return;
        }

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

  return (
    <section className="panel">
      <div className="panelHeader sectionTitle">
        <div>
          <p className="eyebrow">Final Console</p>
          <h3>最终内容调整</h3>
        </div>
        <span className="pill pill-neutral">{job ? `${job.status} / ${job.stage}` : "未触发作业"}</span>
      </div>

      {job?.errorMessage ? <p className="muted">上次执行提示：{job.errorMessage}</p> : null}

      <div className="inlineActions">
        <button className="buttonLike subtleButton" disabled={isPending} onClick={() => void refreshJobDetail()} type="button">
          刷新作业状态
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("retry")} type="button">
          全链路重跑
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("image")} type="button">
          从图片阶段重跑
        </button>
        <button className="buttonLike subtleButton" disabled={isPending || !job} onClick={() => rerunStage("video")} type="button">
          从视频阶段重跑
        </button>
      </div>

      <div className="brandInfoGrid">
        <article className="subPanel">
          <strong>图文预览</strong>
          {selectedImageAsset?.previewUrl ? (
            <img alt="封面预览" src={selectedImageAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} />
          ) : null}
          <p className="muted">{selectedImageAsset?.textContent ?? "暂无图像资产"}</p>
          <label className="field">
            <span>封面资产</span>
            <select onChange={(event) => setCoverAssetId(event.target.value)} value={coverAssetId}>
              {imageAssets.length === 0 ? <option value="">暂无图像</option> : null}
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>替换封面 URL</span>
            <input onChange={(event) => setCoverImageUrl(event.target.value)} value={coverImageUrl} />
          </label>
          <div className="inlineActions">
            <button className="buttonLike subtleButton" disabled={isPending || !selectedImageAsset} onClick={() => regenerateAsset(selectedImageAsset, "重生图片")} type="button">
              重生当前图片
            </button>
            <button className="buttonLike subtleButton" disabled={isPending || !selectedImageAsset} onClick={applyCoverImageUrl} type="button">
              应用封面 URL
            </button>
          </div>
        </article>

        <article className="subPanel">
          <strong>视频预览</strong>
          {selectedVideoAsset?.previewUrl ? (
            isLikelyVideoUrl(selectedVideoAsset.previewUrl) ? (
              <video controls playsInline src={selectedVideoAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} />
            ) : (
              <img alt="视频预览" src={selectedVideoAsset.previewUrl} style={{ width: "100%", borderRadius: "12px" }} />
            )
          ) : null}
          <p className="muted">{selectedVideoAsset?.textContent?.slice(0, 120) ?? "暂无视频资产"}</p>
          <label className="field">
            <span>视频资产</span>
            <select onChange={(event) => setVideoAssetId(event.target.value)} value={videoAssetId}>
              {videoAssets.length === 0 ? <option value="">暂无视频</option> : null}
              {videoAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inlineActions">
            <button className="buttonLike subtleButton" disabled={isPending || !selectedVideoAsset} onClick={() => regenerateAsset(selectedVideoAsset, "重生视频")} type="button">
              重生当前视频
            </button>
          </div>
        </article>
      </div>

      <div className="brandInfoGrid">
        <article className="subPanel">
          <strong>口播预览</strong>
          {selectedVoiceAsset?.previewUrl ? <audio controls src={selectedVoiceAsset.previewUrl} style={{ width: "100%" }} /> : null}
          <p className="muted">{selectedVoiceAsset?.textContent?.slice(0, 180) ?? "暂无口播资产"}</p>
          <label className="field">
            <span>口播资产</span>
            <select onChange={(event) => setVoiceAssetId(event.target.value)} value={voiceAssetId}>
              {voiceAssets.length === 0 ? <option value="">暂无口播</option> : null}
              {voiceAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <button className="buttonLike subtleButton" disabled={isPending || !selectedVoiceAsset} onClick={() => regenerateAsset(selectedVoiceAsset, "重跑口播")} type="button">
            重跑当前口播
          </button>
        </article>

        <article className="subPanel">
          <strong>字幕资产</strong>
          <p className="muted">{selectedSubtitleAsset?.textContent?.slice(0, 120) ?? "暂无字幕资产"}</p>
          <label className="field">
            <span>字幕资产</span>
            <select onChange={(event) => setSubtitleAssetId(event.target.value)} value={subtitleAssetId}>
              {subtitleAssets.length === 0 ? <option value="">暂无字幕</option> : null}
              {subtitleAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <button className="buttonLike subtleButton" disabled={isPending || !selectedSubtitleAsset} onClick={() => regenerateAsset(selectedSubtitleAsset, "重跑字幕")} type="button">
            重跑当前字幕
          </button>
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
          <span>图片资产</span>
          <strong>{imageAssets.length > 0 ? `${imageAssets.length} 份` : "未生成"}</strong>
        </div>
        <div>
          <span>视频资产</span>
          <strong>{videoAssets.length > 0 ? `${videoAssets.length} 份` : "未生成"}</strong>
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
