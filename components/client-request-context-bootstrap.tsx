"use client";

import { useEffect } from "react";

type NavigatorWithConnection = Navigator & {
  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  mozConnection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  webkitConnection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
};

function isSameOriginRequest(input: RequestInfo | URL): boolean {
  try {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    const requestUrl = new URL(rawUrl, window.location.origin);
    return requestUrl.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function ClientRequestContextBootstrap() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isSameOriginRequest(input)) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers);
      const navigatorWithConnection = navigator as NavigatorWithConnection;
      const connection =
        navigatorWithConnection.connection ??
        navigatorWithConnection.mozConnection ??
        navigatorWithConnection.webkitConnection;

      if (connection?.type) {
        headers.set("x-client-network-type", connection.type);
      }

      if (connection?.effectiveType) {
        headers.set("x-client-effective-type", connection.effectiveType);
      }

      if (typeof connection?.downlink === "number" && Number.isFinite(connection.downlink)) {
        headers.set("x-client-downlink", String(connection.downlink));
      }

      if (typeof connection?.rtt === "number" && Number.isFinite(connection.rtt)) {
        headers.set("x-client-rtt", String(connection.rtt));
      }

      if (typeof connection?.saveData === "boolean") {
        headers.set("x-client-save-data", connection.saveData ? "1" : "0");
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (timezone) {
        headers.set("x-client-timezone", timezone);
      }

      if (navigator.platform) {
        headers.set("x-client-platform", navigator.platform);
      }

      return originalFetch(input, {
        ...init,
        headers
      });
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
