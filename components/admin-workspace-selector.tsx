"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function AdminWorkspaceSelector({
  currentWorkspaceId,
  workspaces
}: {
  currentWorkspaceId?: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <label className="field workspaceAdminPicker">
      <span>当前查看组织</span>
      <select
        disabled={isPending}
        onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.set("workspace", event.target.value);
          const target = `${pathname}?${nextParams.toString()}`;

          startTransition(() => {
            router.replace(target as never, { scroll: false });
          });
        }}
        value={currentWorkspaceId ?? workspaces[0]?.id}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} · {workspace.slug}
          </option>
        ))}
      </select>
    </label>
  );
}
