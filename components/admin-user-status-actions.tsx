"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminUserStatusActions({
  currentUserId,
  status,
  userId
}: {
  currentUserId: string;
  status: string;
  userId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "disabled" ? "active" : "disabled";
  const isSelf = currentUserId === userId;

  return (
    <div className="inlineActions">
      <button
        className="buttonLike subtleButton"
        disabled={isPending || isSelf}
        onClick={() => {
          setError(null);

          startTransition(async () => {
            const response = await fetch(`/api/admin/users/${userId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                status: nextStatus
              })
            });

            const result = (await response.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: string;
            };

            if (!response.ok || !result.ok) {
              setError(result.error ?? "status_update_failed");
              return;
            }

            router.refresh();
          });
        }}
        type="button"
      >
        {nextStatus === "disabled" ? "停用账号" : "恢复账号"}
      </button>
      {isSelf ? <p className="muted">当前登录的超级管理员不能在这里停用自己。</p> : null}
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}

