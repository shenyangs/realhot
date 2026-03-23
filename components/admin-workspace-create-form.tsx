"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WORKSPACE_PLAN_OPTIONS, WorkspacePlanType } from "@/lib/auth/workspace-plans";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminWorkspaceCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [planType, setPlanType] = useState<WorkspacePlanType>("trial");
  const [status, setStatus] = useState("active");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch("/api/admin/workspaces", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name,
              slug: normalizeSlug(slug),
              planType,
              status
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "workspace_create_failed");
            return;
          }

          setName("");
          setSlug("");
          setPlanType("trial");
          setStatus("active");
          setMessage("组织已创建");
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Create Workspace</p>
          <h3>新增组织</h3>
        </div>
      </div>
      <div className="teamInviteGrid">
        <label className="field fieldCompact">
          <span>组织名称</span>
          <input
            disabled={isPending}
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);

              if (!slug.trim()) {
                setSlug(normalizeSlug(nextName));
              }
            }}
            placeholder="输入组织名称"
            value={name}
          />
        </label>
        <label className="field fieldCompact">
          <span>组织标识</span>
          <input
            disabled={isPending}
            onChange={(event) => setSlug(normalizeSlug(event.target.value))}
            placeholder="用于链接和系统识别，例如 sam-studio"
            value={slug}
          />
        </label>
        <label className="field fieldCompact">
          <span>套餐</span>
          <select disabled={isPending} onChange={(event) => setPlanType(event.target.value as WorkspacePlanType)} value={planType}>
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
        <select disabled={isPending} onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "创建中..." : "创建组织"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
