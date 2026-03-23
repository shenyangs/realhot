"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

export function AdminUserCreateForm({
  workspaces
}: {
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [role, setRole] = useState<WorkspaceRole>("operator");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              login,
              email,
              displayName,
              password,
              workspaceId,
              role
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            user?: {
              account?: string;
              displayName?: string;
            };
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "user_create_failed");
            return;
          }

          setLogin("");
          setEmail("");
          setDisplayName("");
          setPassword("");
          setRole("operator");
          setWorkspaceId(workspaces[0]?.id ?? "");
          setMessage(`已创建账号：${result.user?.account ?? result.user?.displayName ?? "新用户"}`);
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Admin / Create User</p>
          <h3>手动添加账号</h3>
        </div>
      </div>
      <p className="muted">超级管理员可以直接创建登录账号，并在创建时绑定用户组和角色。</p>
      <div className="teamInviteGrid">
        <label className="field fieldCompact">
          <span>登录账号</span>
          <input
            disabled={isPending}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="例如：admin-zhangsan"
            value={login}
          />
        </label>
        <label className="field fieldCompact">
          <span>邮箱（可选）</span>
          <input
            disabled={isPending}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            type="email"
            value={email}
          />
        </label>
        <label className="field fieldCompact">
          <span>姓名</span>
          <input
            disabled={isPending}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="张三"
            value={displayName}
          />
        </label>
        <label className="field fieldCompact">
          <span>初始密码</span>
          <input
            disabled={isPending}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入初始密码"
            type="password"
            value={password}
          />
        </label>
        <label className="field fieldCompact">
          <span>用户组</span>
          <select disabled={isPending || workspaces.length === 0} onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field fieldCompact">
          <span>角色</span>
          <select disabled={isPending} onChange={(event) => setRole(event.target.value as WorkspaceRole)} value={role}>
            <option value="org_admin">{roleLabels.org_admin}</option>
            <option value="operator">{roleLabels.operator}</option>
            <option value="approver">{roleLabels.approver}</option>
          </select>
        </label>
      </div>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending || workspaces.length === 0} type="submit">
          {isPending ? "创建中..." : "创建账号"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
