import Link from "next/link";
import { AdminHealthPanel } from "@/components/admin-health-panel";
import { PageHero } from "@/components/page-hero";
import { getCurrentViewer } from "@/lib/auth/session";

const adminModules = [
  {
    title: "用户管理",
    description: "查看全部用户、冻结账号、处理组织归属和异常权限。",
    status: "账号侧"
  },
  {
    title: "组织管理",
    description: "查看客户组织、套餐、成员数量和邀请码状态。",
    status: "组织侧"
  },
  {
    title: "模型路由",
    description: "设置全局模型默认值和分功能路由策略。",
    status: "AI 配置"
  },
  {
    title: "审计日志",
    description: "追踪关键变更、权限调整、审核动作和失败原因。",
    status: "运行记录"
  }
];

export default async function AdminPage() {
  const viewer = await getCurrentViewer();

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/admin/users">
              管理用户
            </Link>
            <Link className="buttonLike subtleButton" href="/admin/workspaces">
              管理组织
            </Link>
            <Link className="buttonLike subtleButton" href="/admin/logs">
              查看日志
            </Link>
          </>
        }
        context={viewer.user.displayName}
        description="统一处理用户、组织、模型配置与关键运行记录。"
        eyebrow="Platform Admin"
        facts={[
          { label: "当前身份", value: "超级管理员" },
          { label: "运行环境", value: viewer.mode === "demo" ? "Demo" : "实时环境" },
          { label: "管理范围", value: "用户 / 组织 / 模型 / 日志" }
        ]}
        title="平台后台总控"
      />

      <section className="summaryGrid adminSummaryGrid">
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">平台治理</p>
          <h3>用户、组织与权限</h3>
          <p className="muted">先确认账号与组织边界，再处理后续配置。</p>
        </article>
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">推荐顺序</p>
          <h3>用户、组织、日志</h3>
          <p className="muted">用最短路径排查权限、归属和运行异常。</p>
        </article>
      </section>

      <AdminHealthPanel />

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">后台模块</p>
            <h2>平台侧工作流</h2>
          </div>
        </div>

        <div className="adminModuleGrid">
          {adminModules.map((module) => (
            <article className="adminModuleCard" key={module.title}>
              <div className="adminModuleHead">
                <span className="pill pill-neutral">{module.status}</span>
              </div>
              <strong>{module.title}</strong>
              <p className="muted">{module.description}</p>
            </article>
          ))}
        </div>

        <div className="inlineActions">
          <Link className="buttonLike subtleButton" href="/admin/users">
            看全部用户
          </Link>
          <Link className="buttonLike subtleButton" href="/admin/workspaces">
            看全部组织
          </Link>
          <Link className="buttonLike subtleButton" href="/admin/ai-routing">
            模型路由设置
          </Link>
          <Link className="buttonLike subtleButton" href="/admin/vercel-usage">
            Vercel 用量
          </Link>
          <Link className="buttonLike subtleButton" href="/admin/logs">
            查看操作日志
          </Link>
        </div>
      </section>
    </div>
  );
}
