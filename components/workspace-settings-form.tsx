"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { normalizeWorkspacePlanType, WORKSPACE_PLAN_OPTIONS, WorkspacePlanType } from "@/lib/auth/workspace-plans";

export function WorkspaceSettingsForm({
  canManage,
  workspace
}: {
  canManage: boolean;
  workspace: {
    id: string;
    name: string;
    slug: string;
    planType?: string;
    status?: string;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [planType, setPlanType] = useState<WorkspacePlanType>(normalizeWorkspacePlanType(workspace.planType));
  const [status, setStatus] = useState(workspace.status ?? "active");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch(`/api/admin/workspaces/${workspace.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name,
              slug,
              planType,
              status
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "workspace_update_failed");
            return;
          }

          setMessage("组织设置已更新");
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Workspace Settings</p>
          <h3>编辑组织</h3>
        </div>
      </div>
      <div className="teamInviteGrid">
        <label className="field fieldCompact">
          <span>组织名称</span>
          <input disabled={!canManage || isPending} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="field fieldCompact">
          <span>组织标识</span>
          <input disabled={!canManage || isPending} onChange={(event) => setSlug(event.target.value)} value={slug} />
        </label>
        <label className="field fieldCompact">
          <span>套餐</span>
          <select
            disabled={!canManage || isPending}
            onChange={(event) => setPlanType(event.target.value as WorkspacePlanType)}
            value={planType}
          >
            {WORKSPACE_PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field fieldCompact">
        <span>状态</span>
        <select disabled={!canManage || isPending} onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={!canManage || isPending} type="submit">
          {isPending ? "保存中..." : "保存组织设置"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
