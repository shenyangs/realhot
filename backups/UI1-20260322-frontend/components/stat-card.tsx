import { DashboardMetric } from "@/lib/domain/types";

export function StatCard({ metric }: { metric: DashboardMetric }) {
  return (
    <article className="panel statCard">
      <span className={`pill pill-${metric.tone}`}>{metric.label}</span>
      <h3>{metric.value}</h3>
      <p className="muted">{metric.delta}</p>
    </article>
  );
}
