"use client";

import { useEffect, useRef, useState } from "react";
import {
  readCachedHotspotInsight,
  scheduleHotspotInsightIdleWarmup,
  streamHotspotInsight,
  subscribeHotspotInsightCache,
  type HotspotInsightClientPayload,
  type HotspotInsightRouteClientPayload
} from "@/lib/client/hotspot-insight";

interface HotspotInsightTriggerProps {
  hotspotId: string;
  disabled?: boolean;
}

export function HotspotInsightTrigger({ hotspotId, disabled = false }: HotspotInsightTriggerProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<HotspotInsightClientPayload | null>(null);
  const [draft, setDraft] = useState<Partial<HotspotInsightClientPayload> | null>(null);
  const [routeInfo, setRouteInfo] = useState<HotspotInsightRouteClientPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [hasAutoRequested, setHasAutoRequested] = useState(false);

  useEffect(() => {
    const cached = readCachedHotspotInsight(hotspotId);

    if (cached) {
      setResult(cached);
      setDraft(null);
      setHasAutoRequested(true);
    } else {
      setResult(null);
      setDraft(null);
      setHasAutoRequested(false);
    }

    setMessage("");
    setStatusMessage("");
    setRouteInfo(null);
    setIsStreaming(false);
  }, [hotspotId]);

  useEffect(() => {
    return subscribeHotspotInsightCache((detail) => {
      if (detail.hotspotId !== hotspotId || detail.kind !== "full") {
        return;
      }

      const cached = readCachedHotspotInsight(hotspotId);

      if (!cached) {
        return;
      }

      setResult(cached);
      setDraft(null);
      setIsStreaming(false);
      setHasAutoRequested(true);
    });
  }, [hotspotId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function fetchInsight(trigger: "auto" | "manual" = "manual") {
    if (disabled || isStreaming) {
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    void (async () => {
      if (trigger === "manual") {
        setMessage("");
      }
      setStatusMessage("");
      setDraft(null);
      setIsStreaming(true);

      const payload = await streamHotspotInsight(hotspotId, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "route" && event.route) {
            setRouteInfo(event.route);
            return;
          }

          if (event.type === "status" && event.message) {
            setDraft(null);
            setStatusMessage(event.message);
            return;
          }

          if (event.type === "partial" && event.partial) {
            setDraft((current) => ({
              ...(current ?? {}),
              ...event.partial
            }));
            return;
          }

          if (event.type === "complete" && event.insight) {
            setResult(event.insight);
            setDraft(null);
          }
        }
      });

      if (controller.signal.aborted) {
        return;
      }

      setIsStreaming(false);
      abortRef.current = null;

      if (!payload.ok) {
        if (trigger === "manual") {
          setMessage(payload.error || "生成深挖建议失败");
        }
        return;
      }

      setResult(payload.insight);
      setDraft(null);
      if (trigger === "manual") {
        setMessage("已更新这条热点的专业判断。");
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
        abortRef.current = null;

        if (trigger === "manual") {
          setMessage(error instanceof Error ? error.message : "生成深挖建议失败");
        }
      }
    });
  }

  useEffect(() => {
    if (disabled || hasAutoRequested || result || !blockRef.current) {
      return;
    }

    const target = blockRef.current;
    let cancelIdleWarmup: () => void = () => undefined;
    let hasScheduledWarmup = false;
    let hasTriggered = false;

    const triggerAutoLoad = () => {
      if (hasTriggered) {
        return;
      }

      hasTriggered = true;
      setHasAutoRequested(true);
      fetchInsight("auto");
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
  }, [disabled, hasAutoRequested, hotspotId, isStreaming, result]);

  const displayResult = result
    ? {
        ...result,
        ...(draft ?? {})
      }
    : draft;
  const hasVisibleInsight = Boolean(displayResult && Object.keys(displayResult).length > 0);

  return (
    <div className="hotspotInsightBlock" ref={blockRef}>
      <div className="hotspotInsightActions">
        <button
          className="buttonLike subtleButton"
          disabled={disabled || isStreaming}
          onClick={() => fetchInsight("manual")}
          type="button"
        >
          {disabled
            ? "当前角色不可用"
            : isStreaming
            ? "正在生成专业判断..."
            : result
            ? "刷新专业判断"
            : "补充专业判断"}
        </button>
        <span className="muted">
          {disabled
            ? "当前角色只能查看热点，不能触发深度判断。"
            : isStreaming
            ? routeInfo
              ? `正在流式生成专业判断，当前模型：${routeInfo.provider} / ${routeInfo.model}。`
              : "正在流式生成专业判断..."
            : result
            ? "系统已经提前准备了这条热点的专业判断，你也可以手动刷新。"
            : "热点滑到详情区附近时会先自动预取，尽量减少你主动点击后的等待。"}
        </span>
      </div>

      {message ? <p className="muted inlineActionMessage">{message}</p> : null}
      {statusMessage ? <p className="muted inlineActionMessage">{statusMessage}</p> : null}

      {hasVisibleInsight ? (
        <div className="hotspotInsightCard">
          <div className="tagRow">
            <span className="tag">策略焦点：{displayResult?.productFocus || "生成中"}</span>
            <span className="tag">策划评分：{displayResult?.planningScore || "生成中"}</span>
          </div>
          <div className="hotspotInsightList">
            <div>
              <span>品牌结合路径</span>
              <p className="hotspotInsightText">{displayResult?.connectionPoint || "正在生成..."}</p>
            </div>
            <div>
              <span>传播策略建议</span>
              <p className="hotspotInsightText">{displayResult?.communicationStrategy || "正在生成..."}</p>
            </div>
            <div>
              <span>执行切口</span>
              <p className="hotspotInsightText">{displayResult?.planningDirection || "正在生成..."}</p>
            </div>
            <div>
              <span>渠道与载体建议</span>
              <p className="hotspotInsightText">{displayResult?.recommendedFormat || "正在生成..."}</p>
            </div>
            <div>
              <span>策略评价</span>
              <p className="hotspotInsightText">{displayResult?.planningComment || "正在生成..."}</p>
            </div>
            <div>
              <span>风险与边界</span>
              <p className="hotspotInsightText">{displayResult?.riskNote || "正在生成..."}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
