"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ViewerWorkspace } from "@/lib/auth/types";
import { getWorkspacePlanLabel } from "@/lib/auth/workspace-plans";

export function WorkspaceSelectionList({
  workspaces
}: {
  workspaces: ViewerWorkspace[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack">
      {workspaces.map((workspace) => (
        <button
          className="panel workspaceChoiceCard"
          disabled={isPending}
          key={workspace.id}
          onClick={() => {
            setError(null);

            startTransition(async () => {
              const response = await fetch("/api/session/workspace", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  slug: workspace.slug
                })
              });

              const result = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
              };

              if (!response.ok || !result.ok) {
                setError(result.error ?? "workspace_switch_failed");
                return;
              }

              router.push("/");
              router.refresh();
            });
          }}
          type="button"
        >
          <div className="teamMemberHeader">
            <div>
              <strong>{workspace.name}</strong>
              <p className="muted">{workspace.slug}</p>
            </div>
            <span className="pill">{getWorkspacePlanLabel(workspace.planType)}</span>
          </div>
        </button>
      ))}
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
