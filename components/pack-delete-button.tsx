"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PackDeleteButton({
  packId,
  redirectHref = "/review",
  label = "删除这个选题"
}: {
  packId: string;
  redirectHref?: Route;
  label?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function removePack() {
    if (!window.confirm("删除后，这个选题包和关联的待发布任务都会移除。确定继续吗？")) {
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/review/${packId}`, {
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
        setMessage(payload?.error ?? "删除选题失败");
        return;
      }

      router.push(redirectHref);
      router.refresh();
    });
  }

  return (
    <div className="inlineActionStack">
      <button className="dangerButton" disabled={isPending} onClick={removePack} type="button">
        {isPending ? "正在删除..." : label}
      </button>
      {message ? <p className="muted inlineActionMessage">{message}</p> : null}
    </div>
  );
}
