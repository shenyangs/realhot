import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

function formatInviteTime(value: string) {
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

export function InviteList({
  invites
}: {
  invites: Array<{
    id: string;
    email: string;
    role: WorkspaceRole;
    status: string;
    createdAt: string;
  }>;
}) {
  return (
    <div className="stack">
      {invites.map((invite) => (
        <article className="panel teamMemberCard" key={invite.id}>
          <div className="teamMemberHeader">
            <div>
              <strong>{invite.email}</strong>
              <p className="muted">待加入成员</p>
            </div>
            <span className="pill">{invite.status === "pending" ? "待接受" : invite.status}</span>
          </div>
          <p className="muted">
            角色：{roleLabels[invite.role]} · 创建时间：{formatInviteTime(invite.createdAt)}
          </p>
        </article>
      ))}
    </div>
  );
}

