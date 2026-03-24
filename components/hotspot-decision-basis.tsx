"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { HotspotInsightTrigger } from "@/components/hotspot-insight-trigger";
import {
  fetchHotspotInsightPreviewWithCache,
  readCachedHotspotInsightPreview,
  scheduleHotspotInsightIdleWarmup,
  subscribeHotspotInsightCache,
  type HotspotInsightPreviewClientPayload
} from "@/lib/client/hotspot-insight";

interface HotspotDecisionBasisProps {
  hotspotId: string;
  allowAiActions: boolean;
  fallbackReasons: {
    whyNow: string;
    whyBrand: string;
    angle: string;
  };
  sourceLinks: Array<{
    key: string;
    label: string;
    href: string;
  }>;
}

export function HotspotDecisionBasis({
  hotspotId,
  allowAiActions,
  fallbackReasons,
  sourceLinks
}: HotspotDecisionBasisProps) {
  const [preview, setPreview] = useState<HotspotInsightPreviewClientPayload | null>(null);
  const [message, setMessage] = useState("");
  const [hasAutoRequested, setHasAutoRequested] = useState(false);
  const [isPending, startTransition] = useTransition();
  const blockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = readCachedHotspotInsightPreview(hotspotId);
    setPreview(cached);
    setHasAutoRequested(Boolean(cached));
    setMessage("");
  }, [hotspotId]);

  useEffect(() => {
    return subscribeHotspotInsightCache((detail) => {
      if (detail.hotspotId !== hotspotId || detail.kind !== "preview") {
        return;
      }

      const cached = readCachedHotspotInsightPreview(hotspotId);
      if (cached) {
        setPreview(cached);
      }
    });
  }, [hotspotId]);

  function loadPreview(trigger: "auto" | "manual" = "manual") {
    if (!allowAiActions || isPending) {
      return;
    }

    startTransition(async () => {
      if (trigger === "manual") {
        setMessage("");
      }

      const payload = await fetchHotspotInsightPreviewWithCache(hotspotId);

      if (!payload.ok) {
        if (trigger === "manual") {
          setMessage(payload.error || "获取快速预判失败");
        }
        return;
      }

      setPreview(payload.preview);
      if (trigger === "manual") {
        setMessage(
          payload.preview.source === "ai"
            ? "已更新这条热点的 AI 快速判断。"
            : "已更新这条热点的快速预判。"
        );
      }
    });
  }

  useEffect(() => {
    if (!allowAiActions || hasAutoRequested || preview || !blockRef.current) {
      return;
    }

    const target = blockRef.current;
    let cancelIdleWarmup: () => void = () => {};
    let hasScheduledWarmup = false;
    let hasTriggered = false;

    const triggerAutoLoad = () => {
      if (hasTriggered) {
        return;
      }

      hasTriggered = true;
      setHasAutoRequested(true);
      loadPreview("auto");
    };

    const warmupObserver = new IntersectionObserver(
      (entries) => {
        if (hasScheduledWarmup || !entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        hasScheduledWarmup = true;
        cancelIdleWarmup = scheduleHotspotInsightIdleWarmup(() => {
          triggerAutoLoad();
        });
        warmupObserver.disconnect();
      },
      {
        rootMargin: "0px 0px 1200px 0px",
        threshold: 0.01
      }
    );

    const executeObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        cancelIdleWarmup();
        triggerAutoLoad();
        warmupObserver.disconnect();
        executeObserver.disconnect();
      },
      {
        rootMargin: "0px 0px 260px 0px",
        threshold: 0.1
      }
    );

    warmupObserver.observe(target);
    executeObserver.observe(target);

    return () => {
      cancelIdleWarmup();
      warmupObserver.disconnect();
      executeObserver.disconnect();
    };
  }, [allowAiActions, hasAutoRequested, hotspotId, isPending, preview]);

  const reasons = {
    whyNow: preview?.whyNow || fallbackReasons.whyNow,
    whyBrand: preview?.whyBrand || fallbackReasons.whyBrand,
    angle: preview?.angle || fallbackReasons.angle
  };

  return (
    <div className="hotspotInsightBlock" ref={blockRef}>
      <div className="hotspotInsightActions">
        <span className="muted">
          {preview
            ? preview.source === "ai"
              ? "当前展示的是 AI 快速判断。"
              : "当前展示的是快速预判，基于本地规则先给你一版可直接使用的判断依据。"
            : "先给你一版可直接用的快速预判，滑到附近时会自动准备后面的专业判断。"}
        </span>
        {allowAiActions ? (
          <button
            className="buttonLike subtleButton"
            disabled={isPending}
            onClick={() => loadPreview("manual")}
            type="button"
          >
            {isPending
              ? "判断中..."
              : preview?.source === "ai"
              ? "刷新 AI 快速判断"
              : preview
              ? "刷新快速预判"
              : "补一版快速预判"}
          </button>
        ) : null}
      </div>

      {message ? <p className="muted inlineActionMessage">{message}</p> : null}

      <div className="hotspotInsightCard">
        <div className="tagRow">
          <span className="tag">
            判断来源：{preview?.source === "ai" ? "AI 快速判断" : "本地快速预判"}
          </span>
          <span className="tag">证据链接：{sourceLinks.length} 条</span>
        </div>

        <div className="hotspotInsightList">
          <div>
            <span>为什么现在做</span>
            <p className="hotspotInsightText">{reasons.whyNow}</p>
          </div>
          <div>
            <span>为什么和品牌有关</span>
            <p className="hotspotInsightText">{reasons.whyBrand}</p>
          </div>
          <div>
            <span>建议角度</span>
            <p className="hotspotInsightText">{reasons.angle}</p>
          </div>
          <div>
            <span>可回看的来源</span>
            {sourceLinks.length > 0 ? (
              <ul className="simpleList">
                {sourceLinks.slice(0, 4).map((link) => (
                  <li key={link.key}>
                    <a href={link.href} rel="noreferrer" target="_blank">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hotspotInsightText">当前没有可直接打开的来源链接。</p>
            )}
          </div>
        </div>
      </div>

      <HotspotInsightTrigger disabled={!allowAiActions} hotspotId={hotspotId} />
    </div>
  );
}
