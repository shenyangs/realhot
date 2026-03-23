import Link from "next/link";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { AdminUserStatusActions } from "@/components/admin-user-status-actions";
import { PageHero } from "@/components/page-hero";
import { listPlatformUsers, listPlatformWorkspaces } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

function getStatusTone(status: string, isPlatformAdmin: boolean) {
  if (isPlatformAdmin) {
    return "positive";
  }

  if (status === "disabled") {
    return "warning";
  }

  return "neutral";
}

export default async function AdminUsersPage() {
  const viewer = await getCurrentViewer();
  const [users, workspaces] = await Promise.all([listPlatformUsers(), listPlatformWorkspaces()]);
  const activeUsers = users.filter((user) => user.status !== "disabled").length;
  const disabledUsers = users.filter((user) => user.status === "disabled").length;
  const platformAdmins = users.filter((user) => user.isPlatformAdmin).length;

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#create-user">
              创建账号
            </Link>
            <Link className="buttonLike subtleButton" href="/admin">
              返回后台总览
            </Link>
          </>
        }
        context={viewer.user.displayName}
        description="这里处理平台账号本身，而不是业务任务。重点看账号状态、组织归属和是否存在异常权限。"
        eyebrow="Admin / Users"
        facts={[
          { label: "用户总数", value: `${users.length} 个` },
          { label: "活跃账号", value: `${activeUsers} 个` },
          { label: "停用账号", value: `${disabledUsers} 个` },
          { label: "超级管理员", value: `${platformAdmins} 个` }
        ]}
        title="用户管理"
      />

      <section className="summaryGrid adminSummaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">组织覆盖</p>
          <h3>{workspaces.length} 个组织</h3>
          <p className="muted">账号创建时可以直接绑定组织与角色，减少后续手工配置。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">当前风险</p>
          <h3>{disabledUsers} 个异常账号</h3>
          <p className="muted">优先检查停用原因与是否仍保留敏感权限。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">推荐动作</p>
          <h3>先创建，再检查状态</h3>
          <p className="muted">新账号统一在这里建立，状态变更统一留痕。</p>
        </article>
      </section>

      <section id="create-user">
        <AdminUserCreateForm
          workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug }))}
        />
      </section>

      <section className="adminEntityList">
        {users.map((user) => (
          <article className="panel adminEntityCard" key={user.id}>
            <div className="adminEntityHead">
              <div>
                <strong>{user.displayName}</strong>
                <p className="muted">账号：{user.account}</p>
                <p className="muted">{user.email ?? "未绑定邮箱"}</p>
              </div>
              <span className={`pill pill-${getStatusTone(user.status, user.isPlatformAdmin)}`}>
                {user.isPlatformAdmin ? "超级管理员" : user.status}
              </span>
            </div>

            <div className="adminMetricGrid">
              <div>
                <span>组织数</span>
                <strong>{user.workspaceCount}</strong>
              </div>
              <div>
                <span>归属组织</span>
                <strong>{user.workspaceNames.length > 0 ? user.workspaceNames.join(" / ") : "暂未加入组织"}</strong>
              </div>
            </div>

            <AdminUserStatusActions currentUserId={viewer.user.id} status={user.status} userId={user.id} />
          </article>
        ))}
      </section>
    </div>
  );
}
