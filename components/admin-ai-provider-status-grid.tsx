"use client";

import { useState, useTransition } from "react";
import { AiProvider } from "@/lib/domain/ai-routing";

interface ProviderStatus {
  provider: AiProvider;
  model: string;
  available: boolean;
}

interface ProviderTestState {
  tone: "positive" | "warning" | "neutral";
  message: string;
}

const providerLabels: Record<AiProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax"
};

export function AdminAiProviderStatusGrid({
  providerStatus
}: {
  providerStatus: ProviderStatus[];
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingProvider, setPendingProvider] = useState<AiProvider | null>(null);
  const [testStates, setTestStates] = useState<Partial<Record<AiProvider, ProviderTestState>>>({});

  function runConnectionTest(provider: AiProvider) {
    setPendingProvider(provider);

    startTransition(async () => {
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
              tone: "warning",
              message: result.error ?? "连通性测试失败"
            }
          }));
          return;
        }

        const preview = result.result.outputPreview?.trim();
        const summary = preview
          ? `连通正常 · ${result.result.latencyMs}ms · 返回 ${preview}`
          : `连通正常 · ${result.result.latencyMs}ms`;

        setTestStates((previous) => ({
          ...previous,
          [provider]: {
            tone: "positive",
            message: summary
          }
        }));
      } catch (error) {
        setTestStates((previous) => ({
          ...previous,
          [provider]: {
            tone: "warning",
            message: error instanceof Error ? error.message : "连通性测试失败"
          }
        }));
      } finally {
        setPendingProvider(null);
      }
    });
  }

  return (
    <>
      {providerStatus.map((item) => {
        const state = testStates[item.provider];
        const isTesting = isPending && pendingProvider === item.provider;

        return (
          <article className="panel summaryCard" key={item.provider}>
            <p className="eyebrow">{providerLabels[item.provider]}</p>
            <h3>{item.available ? "已接入" : "未接入"}</h3>
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
