"use client";

import { useEffect, useRef, useState } from "react";
import { AiProvider } from "@/lib/domain/ai-routing";

interface ProviderStatus {
  provider: AiProvider;
  model: string;
  available: boolean;
}

interface ProviderTestState {
  tone: "positive" | "warning" | "negative" | "neutral";
  message: string;
}

const HIGH_LATENCY_MS = 4000;

const providerLabels: Record<AiProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax"
};

export function AdminAiProviderStatusGrid({
  providerStatus
}: {
  providerStatus: ProviderStatus[];
}) {
  const hasAutoRunRef = useRef(false);
  const [pendingProviders, setPendingProviders] = useState<Partial<Record<AiProvider, boolean>>>({});
  const [testStates, setTestStates] = useState<Partial<Record<AiProvider, ProviderTestState>>>({});

  function getSuccessTone(latencyMs: number): ProviderTestState["tone"] {
    return latencyMs >= HIGH_LATENCY_MS ? "warning" : "positive";
  }

  function getSuccessMessage(latencyMs: number, outputPreview?: string | null) {
    const prefix = latencyMs >= HIGH_LATENCY_MS ? "连通正常但延时较高" : "连通正常";
    const preview = outputPreview?.trim();

    return preview ? `${prefix} · ${latencyMs}ms · 返回 ${preview}` : `${prefix} · ${latencyMs}ms`;
  }

  async function runConnectionTest(provider: AiProvider) {
    setPendingProviders((previous) => ({
      ...previous,
      [provider]: true
    }));
    setTestStates((previous) => ({
      ...previous,
      [provider]: {
        tone: "neutral",
        message: "检测中..."
      }
    }));

    try {
      const response = await fetch("/api/admin/ai-routing/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ provider })
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: {
          provider: AiProvider;
          model: string;
          latencyMs: number;
          outputPreview?: string | null;
        };
      };

      if (!response.ok || !result.ok || !result.result) {
        setTestStates((previous) => ({
          ...previous,
          [provider]: {
            tone: "negative",
            message: result.error ?? "连通性测试失败"
          }
        }));
        return;
      }

      const testResult = result.result;

      setTestStates((previous) => ({
        ...previous,
        [provider]: {
          tone: getSuccessTone(testResult.latencyMs),
          message: getSuccessMessage(testResult.latencyMs, testResult.outputPreview)
        }
      }));
    } catch (error) {
      setTestStates((previous) => ({
        ...previous,
        [provider]: {
          tone: "negative",
          message: error instanceof Error ? error.message : "连通性测试失败"
        }
      }));
    } finally {
      setPendingProviders((previous) => ({
        ...previous,
        [provider]: false
      }));
    }
  }

  useEffect(() => {
    if (hasAutoRunRef.current) {
      return;
    }

    hasAutoRunRef.current = true;
    void Promise.all(providerStatus.map((item) => runConnectionTest(item.provider)));
  }, [providerStatus]);

  function getStatusLabel(item: ProviderStatus, state?: ProviderTestState) {
    if (!item.available) {
      return "未接入";
    }

    if (!state) {
      return "待检测";
    }

    if (state.tone === "positive") {
      return "通畅";
    }

    if (state.tone === "warning") {
      return "延时偏高";
    }

    if (state.tone === "negative") {
      return "不通畅";
    }

    return "检测中";
  }

  return (
    <>
      {providerStatus.map((item) => {
        const state = testStates[item.provider];
        const isTesting = Boolean(pendingProviders[item.provider]);

        return (
          <article className="panel summaryCard" key={item.provider}>
            <div className="statusCardLabelRow">
              <span className={`statusDot statusDot-${state?.tone ?? (item.available ? "neutral" : "negative")}`} />
              <p className="eyebrow">{providerLabels[item.provider]}</p>
            </div>
            <h3>{getStatusLabel(item, state)}</h3>
            <p className="muted">当前模型：{item.model}</p>
            <div className="inlineActions">
              <button
                className="buttonLike subtleButton"
                disabled={isTesting}
                onClick={() => runConnectionTest(item.provider)}
                type="button"
              >
                {isTesting ? "测试中..." : "测试连通性"}
              </button>
            </div>
            {state ? <span className={`pill pill-${state.tone}`}>{state.message}</span> : null}
          </article>
        );
      })}
    </>
  );
}
