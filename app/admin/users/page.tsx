import Link from "next/link";
import { AdminUserStatusActions } from "@/components/admin-user-status-actions";
import { listPlatformUsers } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export default async function AdminUsersPage() {
  const viewer = await getCurrentViewer();
  const users = await listPlatformUsers();

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Admin / Users</p>
            <h1>用户管理</h1>
          </div>
          <Link className="buttonLike subtleButton" href="/admin">
            返回后台总览
          </Link>
        </div>
        <p className="muted">集中查看平台所有用户、是否为超级管理员、加入了几个组织。</p>
      </section>

      <div className="stack">
        {users.map((user) => (
          <article className="panel teamMemberCard" key={user.id}>
            <div className="teamMemberHeader">
              <div>
                <strong>{user.displayName}</strong>
                <p className="muted">{user.email ?? "无邮箱"}</p>
              </div>
              <span className="pill">{user.isPlatformAdmin ? "超级管理员" : user.status}</span>
            </div>
            <p className="muted">
              组织数：{user.workspaceCount} · {user.workspaceNames.length > 0 ? `组织：${user.workspaceNames.join(" / ")}` : "暂未加入组织"}
            </p>
            <AdminUserStatusActions currentUserId={viewer.user.id} status={user.status} userId={user.id} />
          </article>
        ))}
      </div>
    </div>
  );
}
