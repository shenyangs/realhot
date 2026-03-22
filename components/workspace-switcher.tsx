"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ViewerWorkspace } from "@/lib/auth/types";

export function WorkspaceSwitcher({
  currentSlug,
  workspaces
}: {
  currentSlug?: string;
  workspaces: ViewerWorkspace[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <label className="field fieldCompact">
      <span>当前工作区</span>
      <select
        defaultValue={currentSlug}
        disabled={isPending}
        onChange={(event) => {
          const slug = event.target.value;

          startTransition(async () => {
            await fetch("/api/session/workspace", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ slug })
            });
            router.refresh();
          });
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.slug}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}

