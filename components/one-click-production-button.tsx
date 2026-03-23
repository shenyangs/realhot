"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AiProvider } from "@/lib/domain/ai-routing";

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

export function OneClickProductionButton({
  packId,
  compact = false,
  disabled = false,
  disabledReason,
  defaultProvider = "minimax",
  defaultModel
}: {
  packId: string;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  defaultProvider?: AiProvider;
  defaultModel?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<AiProvider>(defaultProvider);
  const [imageProvider, setImageProvider] = useState<AiProvider>("minimax");
  const [videoProvider, setVideoProvider] = useState<AiProvider>("minimax");
  const [isPending, startTransition] = useTransition();
  const [pendingJobType, setPendingJobType] = useState<ProductionJobType | null>(null);
  const defaultModelHint = defaultModel?.trim();

  function runProduction(jobType: ProductionJobType) {
    if (disabled) {
      if (disabledReason) {
        setMessage(disabledReason);
      }
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

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "一键制作失败");
          return;
        }

        setMessage(`已使用${providerLabels[provider]}生成${jobTypeLabels[jobType]}首版内容，正在跳转到内容制作页...`);
        router.push(`/production-studio/${packId}`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "一键制作请求失败，请稍后重试。");
      } finally {
        setPendingJobType(null);
      }
    });
  }

  return (
    <div className="subPanel productionQuickStart">
      <div className="listItem">
        <strong>{compact ? "一键制作" : "一键制作图文 + 视频"}</strong>
        <span className={`pill ${disabled ? "pill-neutral" : "pill-positive"}`}>
          {disabled ? "待通过" : "可执行"}
        </span>
      </div>

      {!compact ? (
        <p className="muted">
          {disabled
            ? disabledReason ?? "选题通过后可自动生成图文、视频、口播与字幕。"
            : "现在支持拆开执行：可以单独生成图文、单独生成视频，或者一键全做。"}
        </p>
      ) : null}

      <label className="field fieldCompact">
        <span>制作引擎</span>
        <select
          disabled={isPending || disabled}
          onChange={(event) => setProvider(event.target.value as AiProvider)}
          value={provider}
        >
          <option value="minimax">引擎 A（默认）</option>
          <option value="gemini">引擎 B</option>
        </select>
        <span className="muted">
          当前将使用 {providerLabels[provider]}
          {defaultModelHint ? "，系统会自动选择具体模型。" : "。"}
        </span>
      </label>

      <label className="field fieldCompact">
        <span>图片策划模型</span>
        <select
          disabled={isPending || disabled}
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
          disabled={isPending || disabled}
          onChange={(event) => setVideoProvider(event.target.value as AiProvider)}
          value={videoProvider}
        >
          <option value="minimax">MiniMax M2.7（默认）</option>
          <option value="gemini">Gemini</option>
        </select>
        <span className="muted">只影响视频提示词规划，实际生视频引擎保持不变。</span>
      </label>

      <div className="buttonRow">
        <button
          disabled={isPending || disabled}
          onClick={() => runProduction("article")}
          type="button"
        >
          {isPending && pendingJobType === "article" ? "生成中..." : compact ? "生成图文" : "仅生成图文"}
        </button>
        <button
          className="buttonLike subtleButton"
          disabled={isPending || disabled}
          onClick={() => runProduction("video")}
          type="button"
        >
          {isPending && pendingJobType === "video" ? "生成中..." : compact ? "生成视频" : "仅生成视频"}
        </button>
        <button
          className="buttonLike subtleButton"
          disabled={isPending || disabled}
          onClick={() => runProduction("one_click")}
          type="button"
        >
          {isPending && pendingJobType === "one_click" ? "制作中..." : compact ? "一键全做" : "一键制作图文+视频"}
        </button>
        <Link className="buttonLike subtleButton" href={`/production-studio/${packId}`}>
          打开制作台
        </Link>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
