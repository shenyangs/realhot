import { AdminWorkspaceCreateForm } from "@/components/admin-workspace-create-form";
import { AdminWorkspaceSelector } from "@/components/admin-workspace-selector";
import Link from "next/link";
import { InviteCodeGenerator } from "@/components/invite-code-generator";
import { InviteCodeList } from "@/components/invite-code-list";
import { PageHero } from "@/components/page-hero";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { listInviteCodesForWorkspace, listPlatformWorkspaces } from "@/lib/auth/repository";
import { getWorkspacePlanLabel } from "@/lib/auth/workspace-plans";

export default async function AdminWorkspacesPage({
  searchParams
}: {
  searchParams?: Promise<{
    workspace?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const workspaces = await listPlatformWorkspaces();
  const workspaceCodes = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspaceId: workspace.id,
      codes: await listInviteCodesForWorkspace(workspace.id)
    }))
  );
  const codeMap = new Map(workspaceCodes.map((item) => [item.workspaceId, item.codes]));
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status !== "disabled").length;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0] ?? null;
  const selectedCodes = selectedWorkspace ? codeMap.get(selectedWorkspace.id) ?? [] : [];

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
        description="查看每个客户组织的链接标识、套餐、成员规模，并在这里统一管理组织设置和邀请码。"
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
        {selectedWorkspace ? (
          <article className="panel adminEntityCard workspaceAdminCard" key={selectedWorkspace.id}>
            <div className="adminEntityHead workspaceAdminHead">
              <div>
                <strong>{selectedWorkspace.name}</strong>
                <p className="muted">组织标识：{selectedWorkspace.slug}</p>
              </div>
              <span className="pill">{selectedWorkspace.status}</span>
            </div>

            <AdminWorkspaceSelector
              currentWorkspaceId={selectedWorkspace.id}
              workspaces={workspaces.map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug
              }))}
            />

            <div className="definitionList workspaceAdminSummary">
              <div>
                <span>套餐</span>
                <strong>{getWorkspacePlanLabel(selectedWorkspace.planType)}</strong>
              </div>
              <div>
                <span>成员数</span>
                <strong>{selectedWorkspace.memberCount}</strong>
              </div>
              <div>
                <span>已生成邀请码</span>
                <strong>{selectedCodes.length} 个</strong>
              </div>
            </div>

            <WorkspaceSettingsForm canManage workspace={selectedWorkspace} />
            <InviteCodeGenerator workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} />
            {selectedCodes.length > 0 ? (
              <InviteCodeList
                appUrl={process.env.APP_URL}
                codes={selectedCodes}
                workspaceId={selectedWorkspace.id}
                workspaceName={selectedWorkspace.name}
              />
            ) : (
              <article className="panel systemFeedbackCard">
                <strong>这个组织还没有邀请码</strong>
                <p className="muted">先在上方设置角色、生成数量和可用次数，再点击“生成邀请码”。</p>
              </article>
            )}
          </article>
        ) : (
          <article className="panel systemFeedbackCard">
            <strong>当前还没有组织</strong>
            <p className="muted">先创建一个组织，后面才能配置组织信息和生成邀请码。</p>
          </article>
        )}
      </section>
    </div>
  );
}
