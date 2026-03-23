"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function PageRefreshButton({ label = "刷新" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refreshPage() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      aria-label={label}
      className="sectionActionButton"
      disabled={isPending}
      onClick={refreshPage}
      type="button"
    >
      {isPending ? "刷新中..." : label}
    </button>
  );
}
