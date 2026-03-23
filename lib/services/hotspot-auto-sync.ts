import { getHotspotSignals } from "@/lib/data";
import { syncHotspots } from "@/lib/services/hotspot-sync";

interface EnsureHotspotsFreshResult {
  triggered: boolean;
  reason: "fresh" | "throttled" | "synced" | "sync_failed";
}

let inFlightSync: Promise<EnsureHotspotsFreshResult> | null = null;
let lastSyncAttemptAtMs = 0;
let lastSuccessfulSyncAtMs = 0;

function isBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function parseDurationMinutes(input: string | undefined, fallbackMinutes: number) {
  const parsed = Number.parseInt(input ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMinutes;
}

function resolveStaleAfterMs() {
  const minutes = parseDurationMinutes(process.env.HOTSPOT_AUTO_SYNC_STALE_MINUTES, 240);
  return minutes * 60 * 1000;
}

function resolveMinIntervalMs() {
  const minutes = parseDurationMinutes(process.env.HOTSPOT_AUTO_SYNC_MIN_INTERVAL_MINUTES, 20);
  return minutes * 60 * 1000;
}

export async function ensureHotspotsFresh(): Promise<EnsureHotspotsFreshResult> {
  if (isBuildPhase()) {
    return {
      triggered: false,
      reason: "fresh"
    };
  }

  const now = Date.now();
  const staleAfterMs = resolveStaleAfterMs();
  const minIntervalMs = resolveMinIntervalMs();

  if (inFlightSync) {
    return inFlightSync;
  }

  if (now - lastSyncAttemptAtMs < minIntervalMs) {
    return {
      triggered: false,
      reason: "throttled"
    };
  }

  const hotspots = await getHotspotSignals();
  const latestDetectedAtMs = Date.parse(hotspots[0]?.detectedAt ?? "");
  const latestKnownFreshMs = Math.max(Number.isNaN(latestDetectedAtMs) ? 0 : latestDetectedAtMs, lastSuccessfulSyncAtMs);
  const isStale = latestKnownFreshMs === 0 || now - latestKnownFreshMs > staleAfterMs;

  if (!isStale) {
    return {
      triggered: false,
      reason: "fresh"
    };
  }

  lastSyncAttemptAtMs = now;
  inFlightSync = (async () => {
    try {
      await syncHotspots();
      lastSuccessfulSyncAtMs = Date.now();

      return {
        triggered: true,
        reason: "synced"
      };
    } catch (error) {
      console.error("[hotspot-auto-sync] Auto sync failed", error);
      return {
        triggered: true,
        reason: "sync_failed"
      };
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}
