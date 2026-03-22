"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PublishQueueClearButton({
  packId,
  label,
  emptyLabel
}: {
  packId?: string;
  label: string;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function clearQueue() {
    if (!window.confirm("这会清空当前待执行的发布任务，不会删除已发布记录。确定继续吗？")) {
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch(packId ? `/api/publish/${packId}/queue` : "/api/publish/queue", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: packId ? undefined : JSON.stringify({})
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            removedCount?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "清空待执行失败");
        return;
      }

      const removedCount = payload.removedCount ?? 0;
      setMessage(removedCount > 0 ? `已清空 ${removedCount} 条待执行任务` : emptyLabel ?? "当前没有待清空任务");
      router.refresh();
    });
  }

  return (
    <div className="inlineActionStack">
      <button className="subtleDangerButton" disabled={isPending} onClick={clearQueue} type="button">
        {isPending ? "正在清空..." : label}
      </button>
      {message ? <p className="muted inlineActionMessage">{message}</p> : null}
    </div>
  );
}
