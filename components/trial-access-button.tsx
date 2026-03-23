"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TrialAccessButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enterTrial() {
    if (isPending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/trial", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "trial_access_failed");
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <button className="buttonLike primaryButton" disabled={isPending} onClick={enterTrial} type="button">
        {isPending ? "进入中..." : "游客试用（只读）"}
      </button>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
