import Link from "next/link";
import { InviteCodeGenerator } from "@/components/invite-code-generator";
import { InviteCodeList } from "@/components/invite-code-list";
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

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Admin / Workspaces</p>
            <h1>组织管理</h1>
          </div>
          <Link className="buttonLike subtleButton" href="/admin">
            返回后台总览
          </Link>
        </div>
        <p className="muted">查看每个客户组织的 slug、套餐和成员数量。后面可以继续往这里补停用、额度和品牌数。</p>
      </section>

      <div className="stack">
        {workspaces.map((workspace) => (
          <article className="panel teamMemberCard" key={workspace.id}>
            <div className="teamMemberHeader">
              <div>
                <strong>{workspace.name}</strong>
                <p className="muted">{workspace.slug}</p>
              </div>
              <span className="pill">{workspace.status}</span>
            </div>
            <p className="muted">
              套餐：{workspace.planType ?? "未设置"} · 成员数：{workspace.memberCount}
            </p>
            <WorkspaceSettingsForm canManage workspace={workspace} />
            <InviteCodeGenerator workspaceId={workspace.id} />
            {codeMap.get(workspace.id)?.length ? <InviteCodeList codes={codeMap.get(workspace.id) ?? []} /> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
