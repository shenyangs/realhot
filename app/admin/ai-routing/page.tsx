import Link from "next/link";
import { AdminAiRoutingForm } from "@/components/admin-ai-routing-form";
import { PageHero } from "@/components/page-hero";
import { AI_FEATURES, aiFeatureLabels, AiProvider } from "@/lib/domain/ai-routing";
import { buildEffectiveFeatureRoutes, getAiRoutingConfig } from "@/lib/services/ai-routing-config";

const providerLabels: Record<AiProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax"
};

export default async function AdminAiRoutingPage() {
  const config = await getAiRoutingConfig();
  const effectiveRoutes = buildEffectiveFeatureRoutes(config);
  const providerStatus = [
    {
      provider: "gemini" as const,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro",
      available: Boolean(process.env.GEMINI_API_KEY?.trim())
    },
    {
      provider: "minimax" as const,
      model: process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7",
      available: Boolean(process.env.MINIMAX_API_KEY?.trim())
    }
  ];
  const availableProviders = providerStatus.filter((item) => item.available).length;

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#routing-form">
              修改模型路由
            </Link>
            <Link className="buttonLike subtleButton" href="/admin">
              返回后台总览
            </Link>
          </>
        }
        description="路由页的目标不是展示模型名，而是控制不同 AI 能力的稳定性、成本和质量边界。"
        eyebrow="Admin / AI Routing"
        facts={[
          { label: "默认提供方", value: providerLabels[config.defaultProvider] },
          { label: "可用提供方", value: `${availableProviders}/${providerStatus.length}` },
          { label: "覆盖能力", value: `${AI_FEATURES.length} 项` },
          { label: "当前重点", value: "全局默认 + 分功能覆写" }
        ]}
        title="模型路由设置"
      />

      <section className="summaryGrid adminSummaryGrid">
        {providerStatus.map((item) => (
          <article className="panel summaryCard" key={item.provider}>
            <p className="eyebrow">{providerLabels[item.provider]}</p>
            <h3>{item.available ? "已接入" : "未接入"}</h3>
            <p className="muted">当前模型：{item.model}</p>
          </article>
        ))}
        <article className="panel summaryCard">
          <p className="eyebrow">推荐动作</p>
          <h3>先定默认，再做覆写</h3>
          <p className="muted">只有当某个能力有明显成本或质量差异时，再单独拆出功能路由。</p>
        </article>
      </section>

      <section id="routing-form">
        <AdminAiRoutingForm initialConfig={config} providerStatus={providerStatus} />
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Effective Routes</p>
            <h2>当前生效结果</h2>
          </div>
        </div>

        <div className="adminModuleGrid">
          {AI_FEATURES.map((feature) => (
            <article className="adminModuleCard" key={feature}>
              <span className="pill pill-neutral">{aiFeatureLabels[feature]}</span>
              <strong>{providerLabels[effectiveRoutes[feature]]}</strong>
              <p className="muted">当前该能力会默认走 {providerLabels[effectiveRoutes[feature]]}。</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
