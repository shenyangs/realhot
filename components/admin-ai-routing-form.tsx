"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AI_FEATURES,
  AI_PROVIDERS,
  AiFeature,
  AiProvider,
  AiRoutingConfig,
  aiFeatureLabels
} from "@/lib/domain/ai-routing";

interface ProviderStatus {
  provider: AiProvider;
  model: string;
  available: boolean;
}

const providerLabels: Record<AiProvider, string> = {
  minimax: "MiniMax"
};

const GLOBAL_DEFAULT_PROVIDER_OPTIONS: AiProvider[] = ["minimax"];

function toOverrideState(
  input: Partial<Record<AiFeature, AiProvider>>
): Record<AiFeature, AiProvider | ""> {
  return AI_FEATURES.reduce((accumulator, feature) => {
    accumulator[feature] = input[feature] ?? "";
    return accumulator;
  }, {} as Record<AiFeature, AiProvider | "">);
}

function toPayloadOverrides(
  input: Record<AiFeature, AiProvider | "">
): Partial<Record<AiFeature, AiProvider>> {
  return AI_FEATURES.reduce((accumulator, feature) => {
    const provider = input[feature];

    if (provider) {
      accumulator[feature] = provider;
    }

    return accumulator;
  }, {} as Partial<Record<AiFeature, AiProvider>>);
}

function toModelOverrideState(
  input: Partial<Record<AiFeature, string>>
): Record<AiFeature, string> {
  return AI_FEATURES.reduce((accumulator, feature) => {
    accumulator[feature] = input[feature] ?? "";
    return accumulator;
  }, {} as Record<AiFeature, string>);
}

function toPayloadModelOverrides(
  input: Record<AiFeature, string>
): Partial<Record<AiFeature, string>> {
  return AI_FEATURES.reduce((accumulator, feature) => {
    const model = input[feature]?.trim();

    if (model) {
      accumulator[feature] = model;
    }

    return accumulator;
  }, {} as Partial<Record<AiFeature, string>>);
}

export function AdminAiRoutingForm({
  initialConfig,
  providerStatus
}: {
  initialConfig: AiRoutingConfig;
  providerStatus: ProviderStatus[];
}) {
  const router = useRouter();
  const [defaultProvider, setDefaultProvider] = useState<AiProvider>(initialConfig.defaultProvider);
  const [featureOverrides, setFeatureOverrides] = useState<Record<AiFeature, AiProvider | "">>(
    toOverrideState(initialConfig.featureProviderOverrides)
  );
  const [featureModelOverrides, setFeatureModelOverrides] = useState<Record<AiFeature, string>>(
    toModelOverrideState(initialConfig.featureModelOverrides)
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch("/api/admin/ai-routing", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              defaultProvider,
              featureProviderOverrides: toPayloadOverrides(featureOverrides),
              featureModelOverrides: toPayloadModelOverrides(featureModelOverrides)
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            config?: AiRoutingConfig;
          };

          if (!response.ok || !result.ok || !result.config) {
            setMessage(result.error ?? "ai_routing_update_failed");
            return;
          }

          setDefaultProvider(result.config.defaultProvider);
          setFeatureOverrides(toOverrideState(result.config.featureProviderOverrides));
          setFeatureModelOverrides(toModelOverrideState(result.config.featureModelOverrides));
          setMessage("AI 路由已更新");
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Model Router</p>
          <h3>全局与分功能切换</h3>
        </div>
      </div>

      <div className="stack">
        {providerStatus.map((item) => (
          <p className="muted" key={item.provider}>
            {providerLabels[item.provider]} · 当前模型 {item.model} · {item.available ? "已配置密钥" : "未配置密钥"}
          </p>
        ))}
      </div>

      <label className="field fieldCompact">
        <span>全局默认模型提供方</span>
        <select
          disabled={isPending}
          onChange={(event) => setDefaultProvider(event.target.value as AiProvider)}
          value={defaultProvider}
        >
          {GLOBAL_DEFAULT_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider} value={provider}>
              {providerLabels[provider]}
            </option>
          ))}
        </select>
      </label>

      <div className="stack">
        {AI_FEATURES.map((feature) => {
          const effectiveProvider = featureOverrides[feature] || defaultProvider;
          const effectiveModel = featureModelOverrides[feature]?.trim() || "跟随环境默认模型";

          return (
            <div className="field fieldCompact" key={feature}>
              <span>{aiFeatureLabels[feature]}</span>
              <select
                disabled={isPending}
                onChange={(event) => {
                  const value = event.target.value as AiProvider | "";
                  setFeatureOverrides((previous) => ({
                    ...previous,
                    [feature]: value
                  }));
                }}
                value={featureOverrides[feature]}
                >
                  <option value="">跟随全局（{providerLabels[defaultProvider]}）</option>
                  {AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabels[provider]}
                  </option>
                  ))}
                </select>
              <span className="muted">当前生效：{providerLabels[effectiveProvider]}</span>
              <input
                disabled={isPending}
                onChange={(event) => {
                  const value = event.target.value;
                  setFeatureModelOverrides((previous) => ({
                    ...previous,
                    [feature]: value
                  }));
                }}
                placeholder="留空则跟随当前提供方默认模型"
                value={featureModelOverrides[feature]}
              />
              <span className="muted">模型覆写：{effectiveModel}</span>
            </div>
          );
        })}
      </div>

      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存路由配置"}
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
