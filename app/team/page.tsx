import { canManageMembers, requireWorkspacePageViewer } from "@/lib/auth";
import { listWorkspaceInvites, listWorkspaceMembers } from "@/lib/auth/repository";
import { InviteList } from "@/components/invite-list";
import { TeamMemberManager } from "@/components/team-member-manager";
import { TeamInviteForm } from "@/components/team-invite-form";

export default async function TeamPage() {
  const viewer = await requireWorkspacePageViewer();
  const [members, invites] = await Promise.all([listWorkspaceMembers(), listWorkspaceInvites()]);
  const canManage = canManageMembers(viewer);

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Workspace Team</p>
            <h1>成员管理</h1>
          </div>
          <span className="pill pill-positive">{viewer.currentWorkspace?.name ?? "未选择工作区"}</span>
        </div>
        <p className="muted">这里管理当前工作区成员的角色与状态。首版先支持查看、调角色、停用成员。</p>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">成员数</p>
          <h3>{members.length} 人</h3>
          <p className="muted">内容生产、审核和管理角色都在这里集中查看。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">你的权限</p>
          <h3>{canManage ? "可管理成员" : "只读查看"}</h3>
          <p className="muted">{canManage ? "可以调整角色与状态。" : "当前角色不能修改成员权限。"}</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">待加入</p>
          <h3>{invites.length} 条邀请</h3>
          <p className="muted">未接受的邀请会在这里集中显示。</p>
        </article>
      </section>

      <TeamInviteForm canManage={canManage} />
      <TeamMemberManager canManage={canManage} currentUserId={viewer.user.id} members={members} />
      {invites.length > 0 ? <InviteList invites={invites} /> : null}
    </div>
  );
}
