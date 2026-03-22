"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function OneClickProductionButton({
  packId,
  compact = false
}: {
  packId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className={compact ? "inlineActions" : "stack"}>
      <button
        className="buttonLike primaryButton"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);

            const response = await fetch("/api/production/one-click", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ packId })
            });

            const payload = (await response.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: string;
              studioUrl?: string;
            };

            if (!response.ok || !payload.ok || !payload.studioUrl) {
              setMessage(payload.error ?? "一键制作触发失败");
              return;
            }

            router.push(payload.studioUrl as Route);
            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "制作中..." : "一键制作图文+视频"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
