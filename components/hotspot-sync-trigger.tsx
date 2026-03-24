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
  const [messageTone, setMessageTone] = useState<"neutral" | "positive" | "warning">("neutral");
  const [isPending, startTransition] = useTransition();

  function syncHotspots() {
    startTransition(async () => {
      setMessage("");
      setMessageTone("neutral");

      const response = await fetch("/api/hotspots/sync", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as HotspotSyncPayload | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "手动刷新失败，请稍后再试。");
        setMessageTone("warning");
        return;
      }

      setMessage(buildSyncSuccessMessage(payload));
      setMessageTone("positive");
      router.refresh();
    });
  }

  return (
    <div className="hotspotSyncHeaderActions">
      <div className="hotspotSyncMeta">
        <span className="hotspotSyncEyebrow">手动刷新</span>
        <strong>立即重新抓取热点机会</strong>
        <span className="muted">{lastSyncText}</span>
      </div>
      <div className="hotspotSyncActionRow">
        <button className="buttonLike primaryButton hotspotSyncButton" disabled={isPending} onClick={syncHotspots} type="button">
          <span className="hotspotSyncButtonIcon" aria-hidden="true">
            [R]
          </span>
          {isPending ? "正在刷新热点机会..." : "刷新热点机会"}
        </button>
        <span className="hotspotSyncHint">重新抓取来源、更新排序，并把最新机会刷回当前看板。</span>
      </div>
      {message ? <p className={`hotspotSyncMessage hotspotSyncMessage-${messageTone}`}>{message}</p> : null}
    </div>
  );
}
