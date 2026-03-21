import { SectionHeader } from "@/components/section-header";
import { getPrioritizedHotspots } from "@/lib/data";

export default async function HotspotsPage() {
  const prioritized = await getPrioritizedHotspots();

  return (
    <div className="page">
      <SectionHeader
        title="热点流"
        description="综合品牌相关性、行业重要性、爆发速度和风险等级来筛热点。"
      />

      <section className="grid grid-3">
        {prioritized.map((signal) => (
          <article className="panel" key={signal.id}>
            <div className="panelHeader">
              <div>
                <p className="eyebrow">{signal.kind}</p>
                <h3>{signal.title}</h3>
              </div>
              <span className="pill pill-neutral">{signal.priorityScore}</span>
            </div>
            <div className="stack">
              <p>{signal.summary}</p>
              <div className="scoreGrid">
                <span>相关性 {signal.relevanceScore}</span>
                <span>行业性 {signal.industryScore}</span>
                <span>速度 {signal.velocityScore}</span>
                <span>风险 {signal.riskScore}</span>
              </div>
              <ul className="simpleList">
                {signal.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="listItem">
                <small>{signal.detectedAt}</small>
                <strong>{signal.recommendedAction}</strong>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
