"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

function parseApiErrorMessage(raw: string, jobType: ProductionJobType) {
  const fallback = `${jobTypeLabels[jobType]}生成失败`;

  if (!raw) {
    return fallback;
  }

  try {
    const payload = JSON.parse(raw) as {
      ok?: boolean;
      error?: string;
    };

    return payload?.error?.trim() || fallback;
  } catch {
    const normalized = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!normalized) {
      return fallback;
    }

    if (normalized.toLowerCase().includes("<!doctype") || normalized.toLowerCase().includes("<html")) {
      return `${fallback}，服务端返回了非接口格式内容，请检查 Vercel 部署日志。`;
    }

    return normalized.slice(0, 180);
  }
}

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

        const raw = await response.text().catch(() => "");
        const payload = (() => {
          if (!raw) {
            return null;
          }

          try {
            return JSON.parse(raw) as {
              ok?: boolean;
              error?: string;
              job?: ProductionJobRecord;
            };
          } catch {
            return null;
          }
        })() as
          | {
              ok?: boolean;
              error?: string;
              job?: ProductionJobRecord;
            }
          | null;

        if (!response.ok || !payload?.ok) {
          if (payload?.error?.trim()) {
            setMessage(payload.error.trim());
            return;
          }

          setMessage(parseApiErrorMessage(raw, jobType));
          return;
        }

        const articlePhase = payload?.job?.outputs.draftProgress.articlePhase;

        setMessage(
          articlePhase === "initial"
            ? `已使用${providerLabels[provider]}生成首屏图文，打开制作台后继续往下滑，系统会自动补全后半段。`
            : `已使用${providerLabels[provider]}生成${jobTypeLabels[jobType]}首版内容，正在跳转到内容制作页...`
        );
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
        <strong>{compact ? "图文制作" : "先把图文做出来"}</strong>
        <span className={`pill ${disabled ? "pill-neutral" : "pill-positive"}`}>
          {disabled ? "待通过" : "可执行"}
        </span>
      </div>

      {!compact ? (
        <p className="muted">
          {disabled
            ? disabledReason ?? "选题通过后可生成图文首版。"
            : "当前优先生成图文首版：标题、正文和封面提示词先跑通，视频能力后续再补。"}
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

      <p className="muted productionDeferredHint">视频生成与展示能力暂时后放，当前页面先把图文稿生成和编辑做好。</p>

      <div className="buttonRow">
        <button
          disabled={isPending || disabled}
          onClick={() => runProduction("article")}
          type="button"
        >
          {isPending && pendingJobType === "article" ? "生成中..." : compact ? "生成图文" : "开始生成图文"}
        </button>
        <Link className="buttonLike subtleButton" href={`/production-studio/${packId}`}>
          打开制作台
        </Link>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
