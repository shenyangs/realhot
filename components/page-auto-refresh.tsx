"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface PageAutoRefreshProps {
  intervalMs?: number;
}

export function PageAutoRefresh({ intervalMs = 3 * 60 * 1000 }: PageAutoRefreshProps) {
  const router = useRouter();
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      lastRefreshAtRef.current = Date.now();
      router.refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const elapsed = Date.now() - lastRefreshAtRef.current;
      if (elapsed > 20_000) {
        refreshIfVisible();
      }
    };

    const timer = window.setInterval(refreshIfVisible, intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
