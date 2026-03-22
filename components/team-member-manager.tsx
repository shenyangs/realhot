"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

interface TeamMemberRecord {
  id: string;
  user: {
    id: string;
    displayName: string;
    email?: string;
  };
  role: WorkspaceRole;
  status: string;
  joinedAt?: string;
}

const statusLabels: Record<string, string> = {
  active: "启用中",
  disabled: "已停用",
  invited: "待加入"
};

export function TeamMemberManager({
  canManage,
  currentUserId,
  members
}: {
  canManage: boolean;
  currentUserId: string;
  members: TeamMemberRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  async function updateMember(memberId: string, input: { role?: WorkspaceRole; status?: string }) {
    setErrorById((current) => ({ ...current, [memberId]: "" }));

    const response = await fetch(`/api/workspace/members/${memberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || !result.ok) {
      setErrorById((current) => ({ ...current, [memberId]: result.error ?? "update_failed" }));
      return;
    }

    router.refresh();
  }

  return (
    <div className="stack">
      {members.map((member) => {
        const isSelf = member.user.id === currentUserId;

        return (
          <article className="panel teamMemberCard" key={member.id}>
            <div className="teamMemberHeader">
              <div>
                <strong>{member.user.displayName}</strong>
                <p className="muted">{member.user.email ?? "无邮箱"}</p>
              </div>
              <span className="pill">{statusLabels[member.status] ?? member.status}</span>
            </div>

            <div className="teamMemberGrid">
              <label className="field fieldCompact">
                <span>角色</span>
                <select
                  defaultValue={member.role}
                  disabled={!canManage || isPending || isSelf}
                  onChange={(event) => {
                    const value = event.target.value as WorkspaceRole;

                    startTransition(async () => {
                      await updateMember(member.id, { role: value });
                    });
                  }}
                >
                  <option value="org_admin">{roleLabels.org_admin}</option>
                  <option value="operator">{roleLabels.operator}</option>
                  <option value="approver">{roleLabels.approver}</option>
                </select>
              </label>

              <label className="field fieldCompact">
                <span>状态</span>
                <select
                  defaultValue={member.status}
                  disabled={!canManage || isPending || isSelf}
                  onChange={(event) => {
                    const value = event.target.value;

                    startTransition(async () => {
                      await updateMember(member.id, { status: value });
                    });
                  }}
                >
                  <option value="active">启用中</option>
                  <option value="disabled">已停用</option>
                </select>
              </label>
            </div>

            <p className="muted">
              {isSelf ? "当前登录账号不能在这里修改自己的角色或状态。" : member.joinedAt ? `加入时间：${member.joinedAt}` : "已加入当前工作区"}
            </p>
            {errorById[member.id] ? <p className="muted">{errorById[member.id]}</p> : null}
          </article>
        );
      })}
    </div>
  );
}
