import { AdminWorkspaceCreateForm } from "@/components/admin-workspace-create-form";
import Link from "next/link";
import { InviteCodeGenerator } from "@/components/invite-code-generator";
import { InviteCodeList } from "@/components/invite-code-list";
import { PageHero } from "@/components/page-hero";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { listInviteCodesForWorkspace, listPlatformWorkspaces } from "@/lib/auth/repository";

export default async function AdminWorkspacesPage() {
  const workspaces = await listPlatformWorkspaces();
  const workspaceCodes = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspaceId: workspace.id,
      codes: await listInviteCodesForWorkspace(workspace.id)
    }))
  );
  const codeMap = new Map(workspaceCodes.map((item) => [item.workspaceId, item.codes]));
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status !== "disabled").length;

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#workspace-create">
              新增组织
            </Link>
            <Link className="buttonLike subtleButton" href="/admin">
              返回后台总览
            </Link>
          </>
        }
        description="查看每个客户组织的 slug、套餐、成员规模，并在这里统一管理组织设置和邀请码。"
        eyebrow="Admin / Workspaces"
        facts={[
          { label: "组织总数", value: `${workspaces.length} 个` },
          { label: "活跃组织", value: `${activeWorkspaces} 个` },
          { label: "停用组织", value: `${workspaces.length - activeWorkspaces} 个` }
        ]}
        title="组织管理"
      />

      <section id="workspace-create">
        <AdminWorkspaceCreateForm />
      </section>

      <section className="adminEntityList">
        {workspaces.map((workspace) => (
          <article className="panel adminEntityCard" key={workspace.id}>
            <div className="adminEntityHead">
              <div>
                <strong>{workspace.name}</strong>
                <p className="muted">slug：{workspace.slug}</p>
              </div>
              <span className="pill">{workspace.status}</span>
            </div>

            <div className="adminMetricGrid">
              <div>
                <span>套餐</span>
                <strong>{workspace.planType ?? "trial"}</strong>
              </div>
              <div>
                <span>成员数</span>
                <strong>{workspace.memberCount}</strong>
              </div>
            </div>

            <WorkspaceSettingsForm canManage workspace={workspace} />
            <InviteCodeGenerator workspaceId={workspace.id} workspaceName={workspace.name} />
            {codeMap.get(workspace.id)?.length ? (
              <InviteCodeList appUrl={process.env.APP_URL} codes={codeMap.get(workspace.id) ?? []} workspaceName={workspace.name} />
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
