import Link from "next/link";
import { buildHealthReport, type HealthCheck, type HealthLevel } from "@/lib/services/health-report";

const levelLabel: Record<HealthLevel, string> = {
  pass: "正常",
  warn: "需关注",
  fail: "异常"
};

const levelClass: Record<HealthLevel, string> = {
  pass: "positive",
  warn: "warning",
  fail: "danger"
};

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function extractIssueCount(check: HealthCheck) {
  const details = check.details as { issues?: string[] } | undefined;
  return details?.issues?.length ?? 0;
}

export async function AdminHealthPanel() {
  const report = await buildHealthReport(false);
  const checkEntries = [
    { key: "auth", label: "认证会话", check: report.checks.auth },
    { key: "supabase", label: "数据库", check: report.checks.supabase },
    { key: "ai", label: "AI 路由", check: report.checks.ai },
    { key: "automation", label: "自动化执行", check: report.checks.automation }
  ];
  const issueCount = checkEntries.reduce((sum, item) => sum + extractIssueCount(item.check), 0);

  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="panelHeader sectionTitle">
        <div>
          <p className="eyebrow">系统健康</p>
          <h2>后台体检面板</h2>
          <p className="muted">这里先看配置完整度。需要连通性细查时，再打开深度探测接口。</p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.35rem"
          }}
        >
          <span className={`pill pill-${levelClass[report.status]}`}>{levelLabel[report.status]}</span>
          <span className="muted">最近检查：{formatDateTime(report.checkedAt)}</span>
        </div>
      </div>

      <div className="adminMetricGrid">
        <div className="statusFeedItem">
          <span>当前状态</span>
          <strong>{levelLabel[report.status]}</strong>
        </div>
        <div className="statusFeedItem">
          <span>检查模式</span>
          <strong>{report.mode === "probe" ? "深度探测" : "配置检查"}</strong>
        </div>
        <div className="statusFeedItem">
          <span>需处理项</span>
          <strong>{issueCount} 项</strong>
        </div>
        <div className="statusFeedItem">
          <span>部署环境</span>
          <strong>{report.env.vercelEnv ?? report.env.nodeEnv}</strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.85rem"
        }}
      >
        {checkEntries.map((item) => (
          <article
            className="summaryCard"
            key={item.key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
              minHeight: "100%",
              padding: "1rem 1.05rem"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.8rem"
              }}
            >
              <strong>{item.label}</strong>
              <span className={`pill pill-${levelClass[item.check.level]}`}>{levelLabel[item.check.level]}</span>
            </div>
            <p className="muted">{item.check.summary}</p>
          </article>
        ))}
      </div>

      <div className="inlineActions">
        <Link className="buttonLike subtleButton" href="/api/health" target="_blank">
          查看配置体检 JSON
        </Link>
        <Link className="buttonLike subtleButton" href="/api/health?probe=1" target="_blank">
          查看深度探测 JSON
        </Link>
        <Link className="buttonLike subtleButton" href="/admin/ai-routing">
          去看模型路由
        </Link>
      </div>
    </section>
  );
}
