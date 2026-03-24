"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

function normalizeIntegerInput(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function sanitizeDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function InviteCodeGenerator({
  workspaceId,
  workspaceName
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<WorkspaceRole>("operator");
  const [quantityInput, setQuantityInput] = useState("1");
  const [maxUsesInput, setMaxUsesInput] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const quantity = useMemo(() => normalizeIntegerInput(quantityInput, 1, 1, 20), [quantityInput]);
  const maxUses = useMemo(() => normalizeIntegerInput(maxUsesInput, 1, 1, 100), [maxUsesInput]);

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

          setMessage(`已生成 ${result.codes?.length ?? quantity} 个邀请码，系统会按这一批合并展示。`);
          setQuantityInput("1");
          setMaxUsesInput("1");
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
          <input
            inputMode="numeric"
            min={1}
            onBlur={() => setQuantityInput(String(quantity))}
            onChange={(event) => setQuantityInput(sanitizeDigits(event.target.value))}
            placeholder="1-20"
            type="text"
            value={quantityInput}
          />
        </label>
        <label className="field fieldCompact">
          <span>每个码可用次数</span>
          <input
            inputMode="numeric"
            min={1}
            onBlur={() => setMaxUsesInput(String(maxUses))}
            onChange={(event) => setMaxUsesInput(sanitizeDigits(event.target.value))}
            placeholder="1-100"
            type="text"
            value={maxUsesInput}
          />
        </label>
      </div>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "生成中..." : "生成邀请码"}
        </button>
      </div>
      <p className="muted">数量和可用次数现在都可以先删空再输入，提交时会自动按有效范围校正。</p>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
