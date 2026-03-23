import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";

export interface RequestAuditContext {
  ip?: string;
  forwardedFor?: string;
  requestId?: string;
  userAgent?: string;
  origin?: string;
  referer?: string;
  acceptLanguage?: string;
  deviceType?: "mobile" | "desktop" | "unknown";
  networkType?: string;
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
  timezone?: string;
  platform?: string;
  macAddress?: null;
  macAddressNote?: string;
}

const requestAuditContextStorage = new AsyncLocalStorage<RequestAuditContext>();

function readFirstForwardedIp(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const first = value
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);

  if (!first) {
    return undefined;
  }

  return first.replace(/^for=/i, "").replace(/^"|"$/g, "");
}

function parseFloatHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIntegerHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanHeader(value: string | null): boolean | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }

  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }

  return undefined;
}

function resolveDeviceType(request: NextRequest): "mobile" | "desktop" | "unknown" {
  const chMobile = request.headers.get("sec-ch-ua-mobile");

  if (chMobile === "?1") {
    return "mobile";
  }

  if (chMobile === "?0") {
    return "desktop";
  }

  const ua = request.headers.get("user-agent")?.toLowerCase() ?? "";

  if (!ua) {
    return "unknown";
  }

  if (/(iphone|ipad|ipod|android|mobile|windows phone)/.test(ua)) {
    return "mobile";
  }

  return "desktop";
}

function extractRequestAuditContext(request: NextRequest): RequestAuditContext {
  const forwardedFor =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-client-ip");
  const ip = readFirstForwardedIp(forwardedFor);

  return {
    ip,
    forwardedFor: forwardedFor ?? undefined,
    requestId:
      request.headers.get("x-request-id") ??
      request.headers.get("x-vercel-id") ??
      undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    origin: request.headers.get("origin") ?? undefined,
    referer: request.headers.get("referer") ?? undefined,
    acceptLanguage: request.headers.get("accept-language") ?? undefined,
    deviceType: resolveDeviceType(request),
    networkType: request.headers.get("x-client-network-type") ?? undefined,
    effectiveType: request.headers.get("x-client-effective-type") ?? undefined,
    downlinkMbps: parseFloatHeader(request.headers.get("x-client-downlink")),
    rttMs: parseIntegerHeader(request.headers.get("x-client-rtt")),
    saveData: parseBooleanHeader(request.headers.get("x-client-save-data")),
    timezone: request.headers.get("x-client-timezone") ?? undefined,
    platform: request.headers.get("x-client-platform") ?? undefined,
    macAddress: null,
    macAddressNote: "浏览器环境无法获取真实 MAC 地址（系统安全限制）"
  };
}

export function setRequestAuditContext(request: NextRequest) {
  requestAuditContextStorage.enterWith(extractRequestAuditContext(request));
}

export function getRequestAuditContext(): RequestAuditContext | null {
  return requestAuditContextStorage.getStore() ?? null;
}
