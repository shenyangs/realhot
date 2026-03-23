import { parseServerSentEvents } from "@/lib/shared/server-sent-events";

export interface HotspotInsightClientPayload {
  productFocus: string;
  connectionPoint: string;
  communicationStrategy: string;
  planningDirection: string;
  recommendedFormat: string;
  planningScore: string;
  planningComment: string;
  riskNote: string;
}

export interface HotspotInsightPreviewClientPayload {
  whyNow: string;
  whyBrand: string;
  angle: string;
  source: "local" | "ai";
}

export interface HotspotInsightRouteClientPayload {
  provider: string;
  model: string;
  reason: string;
}

export interface HotspotInsightStreamEventPayload {
  type: "route" | "partial" | "complete" | "status" | "error";
  route?: HotspotInsightRouteClientPayload;
  partial?: Partial<HotspotInsightClientPayload>;
  insight?: HotspotInsightClientPayload;
  message?: string;
  error?: string;
}

interface HotspotInsightResponsePayload {
  ok?: boolean;
  insight?: HotspotInsightClientPayload;
  error?: string;
}

interface HotspotInsightPreviewResponsePayload {
  ok?: boolean;
  preview?: HotspotInsightPreviewClientPayload;
  error?: string;
}

interface HotspotInsightSuccessResult {
  ok: true;
  insight: HotspotInsightClientPayload;
}

interface HotspotInsightFailureResult {
  ok: false;
  error: string;
}

type HotspotInsightRequestResult = HotspotInsightSuccessResult | HotspotInsightFailureResult;

interface HotspotInsightPreviewSuccessResult {
  ok: true;
  preview: HotspotInsightPreviewClientPayload;
}

type HotspotInsightPreviewRequestResult =
  | HotspotInsightPreviewSuccessResult
  | HotspotInsightFailureResult;

const pendingHotspotInsightRequests = new Map<string, Promise<HotspotInsightRequestResult>>();
const pendingHotspotInsightPreviewRequests = new Map<string, Promise<HotspotInsightPreviewRequestResult>>();
const hotspotInsightCacheEventName = "hotspot-insight-cache-updated";

function getHotspotInsightStorageKey(hotspotId: string) {
  return `hotspot-insight:${hotspotId}`;
}

function getHotspotInsightPreviewStorageKey(hotspotId: string) {
  return `hotspot-insight-preview:${hotspotId}`;
}

function emitHotspotInsightCacheUpdated(hotspotId: string, kind: "full" | "preview") {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(hotspotInsightCacheEventName, {
      detail: {
        hotspotId,
        kind
      }
    })
  );
}

export function readCachedHotspotInsight(hotspotId: string): HotspotInsightClientPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getHotspotInsightStorageKey(hotspotId));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as HotspotInsightClientPayload;
  } catch {
    window.sessionStorage.removeItem(getHotspotInsightStorageKey(hotspotId));
    return null;
  }
}

export function writeCachedHotspotInsight(hotspotId: string, payload: HotspotInsightClientPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getHotspotInsightStorageKey(hotspotId), JSON.stringify(payload));
  emitHotspotInsightCacheUpdated(hotspotId, "full");
}

export function readCachedHotspotInsightPreview(hotspotId: string): HotspotInsightPreviewClientPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getHotspotInsightPreviewStorageKey(hotspotId));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as HotspotInsightPreviewClientPayload;
  } catch {
    window.sessionStorage.removeItem(getHotspotInsightPreviewStorageKey(hotspotId));
    return null;
  }
}

export function writeCachedHotspotInsightPreview(
  hotspotId: string,
  payload: HotspotInsightPreviewClientPayload
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getHotspotInsightPreviewStorageKey(hotspotId), JSON.stringify(payload));
  emitHotspotInsightCacheUpdated(hotspotId, "preview");
}

async function requestHotspotInsight(hotspotId: string): Promise<HotspotInsightRequestResult> {
  const response = await fetch("/api/hotspots/insight", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      hotspotId
    })
  });

  const payload = (await response.json().catch(() => null)) as HotspotInsightResponsePayload | null;

  if (!response.ok || !payload?.ok || !payload.insight) {
    return {
      ok: false,
      error: payload?.error ?? "生成深挖建议失败"
    };
  }

  writeCachedHotspotInsight(hotspotId, payload.insight);

  return {
    ok: true,
    insight: payload.insight
  };
}

async function requestHotspotInsightPreview(
  hotspotId: string
): Promise<HotspotInsightPreviewRequestResult> {
  const response = await fetch("/api/hotspots/insight-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      hotspotId
    })
  });

  const payload = (await response.json().catch(() => null)) as HotspotInsightPreviewResponsePayload | null;

  if (!response.ok || !payload?.ok || !payload.preview) {
    return {
      ok: false,
      error: payload?.error ?? "生成快速判断失败"
    };
  }

  writeCachedHotspotInsightPreview(hotspotId, payload.preview);

  return {
    ok: true,
    preview: payload.preview
  };
}

export async function fetchHotspotInsightWithCache(hotspotId: string): Promise<HotspotInsightRequestResult> {
  const cached = readCachedHotspotInsight(hotspotId);

  if (cached) {
    return {
      ok: true,
      insight: cached
    };
  }

  const pending = pendingHotspotInsightRequests.get(hotspotId);

  if (pending) {
    return pending;
  }

  const nextRequest = requestHotspotInsight(hotspotId).finally(() => {
    pendingHotspotInsightRequests.delete(hotspotId);
  });

  pendingHotspotInsightRequests.set(hotspotId, nextRequest);
  return nextRequest;
}

export async function streamHotspotInsight(
  hotspotId: string,
  options?: {
    signal?: AbortSignal;
    onEvent?: (event: HotspotInsightStreamEventPayload) => void;
  }
): Promise<HotspotInsightRequestResult> {
  const cached = readCachedHotspotInsight(hotspotId);

  if (cached) {
    options?.onEvent?.({
      type: "complete",
      insight: cached
    });

    return {
      ok: true,
      insight: cached
    };
  }

  const response = await fetch("/api/hotspots/insight/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({
      hotspotId
    }),
    signal: options?.signal
  });

  if (!response.ok || !response.body) {
    return {
      ok: false,
      error: "生成深挖建议失败"
    };
  }

  let finalInsight: HotspotInsightClientPayload | null = null;

  for await (const message of parseServerSentEvents(response.body)) {
    const payload = JSON.parse(message.data) as HotspotInsightStreamEventPayload;

    options?.onEvent?.(payload);

    if (payload.type === "complete" && payload.insight) {
      writeCachedHotspotInsight(hotspotId, payload.insight);
      finalInsight = payload.insight;
    }

    if (payload.type === "error") {
      return {
        ok: false,
        error: payload.error || "生成深挖建议失败"
      };
    }
  }

  if (finalInsight) {
    return {
      ok: true,
      insight: finalInsight
    };
  }

  return {
    ok: false,
    error: "生成深挖建议失败"
  };
}

export async function fetchHotspotInsightPreviewWithCache(
  hotspotId: string
): Promise<HotspotInsightPreviewRequestResult> {
  const cached = readCachedHotspotInsightPreview(hotspotId);

  if (cached) {
    return {
      ok: true,
      preview: cached
    };
  }

  const pending = pendingHotspotInsightPreviewRequests.get(hotspotId);

  if (pending) {
    return pending;
  }

  const nextRequest = requestHotspotInsightPreview(hotspotId).finally(() => {
    pendingHotspotInsightPreviewRequests.delete(hotspotId);
  });

  pendingHotspotInsightPreviewRequests.set(hotspotId, nextRequest);
  return nextRequest;
}

export function subscribeHotspotInsightCache(
  listener: (detail: { hotspotId: string; kind: "full" | "preview" }) => void
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ hotspotId: string; kind: "full" | "preview" }>).detail;

    if (detail) {
      listener(detail);
    }
  };

  window.addEventListener(hotspotInsightCacheEventName, handler);

  return () => {
    window.removeEventListener(hotspotInsightCacheEventName, handler);
  };
}

export function scheduleHotspotInsightIdleWarmup(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const requestIdleCallback =
    "requestIdleCallback" in window ? window.requestIdleCallback.bind(window) : null;
  const cancelIdleCallback =
    "cancelIdleCallback" in window ? window.cancelIdleCallback.bind(window) : null;

  if (requestIdleCallback && cancelIdleCallback) {
    const idleCallbackId = requestIdleCallback(() => {
      task();
    }, { timeout: 1200 });

    return () => {
      cancelIdleCallback(idleCallbackId);
    };
  }

  const timeoutId = globalThis.setTimeout(() => {
    task();
  }, 220);

  return () => {
    globalThis.clearTimeout(timeoutId);
  };
}
