"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

export function InviteCodeGenerator({
  workspaceId,
  workspaceName
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<WorkspaceRole>("operator");
  const [quantity, setQuantity] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch(`/api/admin/workspaces/${workspaceId}/invite-codes`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              role,
              quantity,
              maxUses
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            codes?: Array<{ code: string }>;
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "invite_code_create_failed");
            return;
          }

          setMessage(`已生成 ${result.codes?.length ?? quantity} 个邀请码`);
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Invite Codes</p>
          <h3>生成邀请码</h3>
        </div>
      </div>
      <p className="muted">当前绑定用户组：{workspaceName}。新用户使用邀请码注册后会自动加入这个用户组，并套用所选角色。</p>
      <div className="teamInviteGrid">
        <label className="field fieldCompact">
          <span>角色</span>
          <select onChange={(event) => setRole(event.target.value as WorkspaceRole)} value={role}>
            <option value="org_admin">{roleLabels.org_admin}</option>
            <option value="operator">{roleLabels.operator}</option>
            <option value="media_channel">{roleLabels.media_channel}</option>
            <option value="approver">{roleLabels.approver}</option>
          </select>
        </label>
        <label className="field fieldCompact">
          <span>生成数量</span>
          <input min={1} onChange={(event) => setQuantity(Number(event.target.value) || 1)} type="number" value={quantity} />
        </label>
        <label className="field fieldCompact">
          <span>每个码可用次数</span>
          <input min={1} onChange={(event) => setMaxUses(Number(event.target.value) || 1)} type="number" value={maxUses} />
        </label>
      </div>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "生成中..." : "生成邀请码"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
