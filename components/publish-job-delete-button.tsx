"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PublishJobDeleteButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function removeJob() {
    if (!window.confirm("删除后，这条待执行任务会从发布队列中移除。确定继续吗？")) {
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/publish/jobs/${jobId}`, {
        method: "DELETE"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            removed?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.removed) {
        setMessage(payload?.error ?? "删除待执行任务失败");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="inlineActionStack publishInlineActionStack">
      <button className="inlineTextButton" disabled={isPending} onClick={removeJob} type="button">
        {isPending ? "删除中..." : "删除"}
      </button>
      {message ? <p className="muted inlineActionMessage">{message}</p> : null}
    </div>
  );
}
