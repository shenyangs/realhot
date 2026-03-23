"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

export function TeamInviteForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("operator");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || isPending) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/workspace/members/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          displayName,
          role
        })
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setMessage(result.error ?? "invite_failed");
        return;
      }

      setEmail("");
      setDisplayName("");
      setRole("operator");
      setMessage("邀请已创建");
      router.refresh();
    });
  }

  return (
    <form className="panel stack" onSubmit={handleSubmit}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Invite</p>
          <h3>邀请成员</h3>
        </div>
      </div>
      <div className="teamInviteGrid">
        <label className="field fieldCompact">
          <span>邮箱</span>
          <input disabled={!canManage || isPending} onChange={(event) => setEmail(event.target.value)} placeholder="new.member@company.com" type="email" value={email} />
        </label>
        <label className="field fieldCompact">
          <span>姓名</span>
          <input disabled={!canManage || isPending} onChange={(event) => setDisplayName(event.target.value)} placeholder="可选，demo 会话建议填写" type="text" value={displayName} />
        </label>
        <label className="field fieldCompact">
          <span>角色</span>
          <select disabled={!canManage || isPending} onChange={(event) => setRole(event.target.value as WorkspaceRole)} value={role}>
            <option value="org_admin">{roleLabels.org_admin}</option>
            <option value="operator">{roleLabels.operator}</option>
            <option value="media_channel">{roleLabels.media_channel}</option>
            <option value="approver">{roleLabels.approver}</option>
          </select>
        </label>
      </div>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={!canManage || isPending} type="submit">
          {isPending ? "提交中..." : "创建邀请"}
        </button>
      </div>
      <p className="muted">
        {canManage
          ? "demo 模式下会直接生成一条待加入邀请；Supabase 模式下会写入 workspace_invites。"
          : "当前角色只能查看，不能邀请成员。"}
      </p>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
