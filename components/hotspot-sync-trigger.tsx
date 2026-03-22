"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface HotspotSyncPayload {
  ok?: boolean;
  error?: string;
  hotspots?: unknown[];
  generatedPacks?: unknown[];
  providers?: Array<{
    fetchStatus?: "ok" | "empty" | "failed";
  }>;
}

function buildSyncSuccessMessage(payload: HotspotSyncPayload) {
  const hotspotCount = Array.isArray(payload.hotspots) ? payload.hotspots.length : undefined;
  const generatedPackCount = Array.isArray(payload.generatedPacks) ? payload.generatedPacks.length : 0;
  const failedProviderCount = Array.isArray(payload.providers)
    ? payload.providers.filter((provider) => provider.fetchStatus === "failed").length
    : 0;
  const parts: string[] = [];

  if (typeof hotspotCount === "number") {
    parts.push(`已拉取 ${hotspotCount} 条热点`);
  } else {
    parts.push("已完成热点拉取");
  }

  if (generatedPackCount > 0) {
    parts.push(`自动生成 ${generatedPackCount} 个选题包`);
  }

  if (failedProviderCount > 0) {
    parts.push(`${failedProviderCount} 个来源失败`);
  }

  return `${parts.join("，")}。`;
}

export function HotspotSyncTrigger({ lastSyncText }: { lastSyncText: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function syncHotspots() {
    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/hotspots/sync", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as HotspotSyncPayload | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "手动刷新失败，请稍后再试。");
        return;
      }

      setMessage(buildSyncSuccessMessage(payload));
      router.refresh();
    });
  }

  return (
    <div className="hotspotSyncHeaderActions">
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} onClick={syncHotspots} type="button">
          {isPending ? "正在刷新热点..." : "手动刷新热点"}
        </button>
        <span className="muted">{lastSyncText}</span>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
