import Link from "next/link";
import { getCurrentViewer } from "@/lib/auth/session";

const adminModules = [
  {
    title: "用户管理",
    description: "查看全部用户、冻结账号、处理组织归属和异常权限。"
  },
  {
    title: "组织管理",
    description: "查看客户组织、品牌数量、成员数量和最近活跃状态。"
  },
  {
    title: "额度与套餐",
    description: "管理 AI 配额、热点同步频率和组织级能力边界。"
  },
  {
    title: "系统配置",
    description: "管理模型路由、热点源开关、全局参数和环境检查。"
  },
  {
    title: "任务监控",
    description: "查看热点同步、内容生成、导出发布等任务运行状态。"
  },
  {
    title: "审计日志",
    description: "追踪关键变更、权限调整、审核动作和失败原因。"
  }
];

export default async function AdminPage() {
  const viewer = await getCurrentViewer();

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Platform Admin</p>
            <h1>平台后台</h1>
          </div>
          <span className="pill pill-positive">{viewer.user.displayName}</span>
        </div>
        <p className="muted">
          这里给超级管理员统一管理用户、组织、额度和系统运行状态，不和客户日常工作台混在一起。
        </p>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">身份</p>
          <h3>超级管理员</h3>
          <p className="muted">拥有平台级视角与管理权限。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">当前模式</p>
          <h3>{viewer.mode === "demo" ? "Demo" : "Supabase"}</h3>
          <p className="muted">后续会在这里接入真实登录与组织管理数据。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">下一步</p>
          <h3>先接真实成员与组织数据</h3>
          <p className="muted">当前先把后台入口和权限边界立起来，避免前后台混用。</p>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">后台模块</p>
            <h2>平台侧要管的事情，集中放在这里</h2>
          </div>
        </div>

        <div className="onboardingGrid">
          {adminModules.map((module) => (
            <article className="onboardingCard" key={module.title}>
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
        </div>
      </section>
    </div>
  );
}
