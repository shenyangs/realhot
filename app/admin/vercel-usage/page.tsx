import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { getVercelUsageSummary } from "@/lib/services/vercel-usage";

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(parsed);
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2
  }).format(value);
}

function normalizeDays(raw?: string): number {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.min(365, Math.floor(parsed));
}

export default async function AdminVercelUsagePage({
  searchParams
}: {
  searchParams?: Promise<{
    days?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const days = normalizeDays(params.days);
  const summary = await getVercelUsageSummary({
    days
  });
  const dayOptions = [7, 30, 90, 180];

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/admin">
              返回后台总览
            </Link>
            <Link className="buttonLike subtleButton" href="/admin/logs">
              查看平台日志
            </Link>
          </>
        }
        description="Vercel 用量页也应该是平台控制台的一部分，用来观察基础设施成本、服务分布和拉取状态，而不是独立的小工具页。"
        eyebrow="Admin / Vercel Usage"
        facts={[
          { label: "当前窗口", value: `最近 ${days} 天` },
          { label: "状态", value: summary.state === "ok" ? "已连接" : "待配置 / 受限" },
          { label: "记录数", value: formatNumber(summary.recordCount) },
          { label: "费用 (USD)", value: summary.totalCostUsd === null ? "—" : `$${formatNumber(summary.totalCostUsd)}` }
        ]}
        title="Vercel 用量面板"
      />

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Time Range</p>
            <h2>观察窗口</h2>
          </div>
        </div>

        <div className="inlineActions">
          {dayOptions.map((option) => (
            <Link className="buttonLike subtleButton" href={`/admin/vercel-usage?days=${option}`} key={option}>
              最近 {option} 天
            </Link>
          ))}
          <Link className="buttonLike subtleButton" href="/admin/vercel-usage">
            恢复默认
          </Link>
        </div>
        <p className="muted">
          当前窗口：{formatDateTime(summary.from)} ~ {formatDateTime(summary.to)}
        </p>
      </section>

      <section className="summaryGrid adminSummaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">接口状态</p>
          <h3>{summary.state === "ok" ? "已连接" : "待配置 / 受限"}</h3>
          <p className="muted">{summary.message}</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">记录数</p>
          <h3>{formatNumber(summary.recordCount)}</h3>
          <p className="muted">最近 {days} 天返回的 usage 行数。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">最近拉取</p>
          <h3>{formatDateTime(summary.pulledAt)}</h3>
          <p className="muted">用于判断这组数据是否仍然新鲜。</p>
        </article>
      </section>

      {summary.state !== "ok" ? (
        <section className="panel systemFeedbackCard">
          <strong>当前还没有可用的 Vercel 计费数据</strong>
          <p className="muted">
            需要配置 <code>VERCEL_API_TOKEN</code>，可选 <code>VERCEL_TEAM_ID</code> / <code>VERCEL_TEAM_SLUG</code>，配置完成后重新部署再刷新本页。
          </p>
        </section>
      ) : null}

      <section className="adminEntityList">
        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">Top Services</p>
              <h2>用量分布</h2>
            </div>
          </div>

          <div className="adminEntityList">
            {summary.topServices.length === 0 ? (
              <div className="systemFeedbackCard systemFeedbackCardCompact">
                <strong>当前窗口暂无服务聚合数据</strong>
                <p className="muted">可能是当前时间范围内没有返回细分服务用量，或 API 权限有限。</p>
              </div>
            ) : (
              summary.topServices.map((item) => (
                <article className="adminEntityCard" key={item.name}>
                  <div className="adminEntityHead">
                    <strong>{item.name}</strong>
                    <span className="pill pill-neutral">
                      {item.costUsd === null ? "无费用字段" : `$${formatNumber(item.costUsd)}`}
                    </span>
                  </div>
                  <div className="adminMetricGrid">
                    <div>
                      <span>用量</span>
                      <strong>{item.quantity === null ? "—" : formatNumber(item.quantity)}</strong>
                    </div>
                    <div>
                      <span>单位</span>
                      <strong>{item.unit ?? "未返回"}</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">Units</p>
              <h2>按单位汇总</h2>
            </div>
          </div>

          <div className="adminEntityList">
            {summary.usageByUnit.length === 0 ? (
              <div className="systemFeedbackCard systemFeedbackCardCompact">
                <strong>未解析到可汇总单位</strong>
                <p className="muted">当前响应里没有稳定的单位字段，或当前时间窗口样本不足。</p>
              </div>
            ) : (
              summary.usageByUnit.map((item) => (
                <article className="adminEntityCard" key={item.unit}>
                  <div className="adminEntityHead">
                    <strong>{item.unit}</strong>
                    <span className="pill pill-neutral">汇总</span>
                  </div>
                  <div className="adminMetricGrid">
                    <div>
                      <span>数量</span>
                      <strong>{formatNumber(item.quantity)}</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">Debug</p>
              <h2>接口字段样本</h2>
            </div>
          </div>

          {summary.sampleFields.length === 0 ? (
            <div className="systemFeedbackCard systemFeedbackCardCompact">
              <strong>当前没有字段样本</strong>
              <p className="muted">这通常说明返回数据为空，或 API 没有给出足够的字段用于调试。</p>
            </div>
          ) : (
            <div className="tagRow">
              {summary.sampleFields.map((field) => (
                <span className="tag" key={field}>
                  {field}
                </span>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
