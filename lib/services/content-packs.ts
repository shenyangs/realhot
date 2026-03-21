import {
  getBrandStrategyPack,
  getHotspotPack,
  getHotspotSignals,
  getReviewQueue
} from "@/lib/data";
import { HotspotPack } from "@/lib/domain/types";
import { decideModelRoute } from "@/lib/services/model-router";

export async function summarizeGenerationContext(pack: HotspotPack): Promise<string> {
  const [brand, signals] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  const hotspot = signals.find((signal) => signal.id === pack.hotspotId);
  const route = decideModelRoute("content-generation");

  return [
    `Brand: ${brand.name}`,
    `Hotspot: ${hotspot?.title ?? "Unknown"}`,
    `Route: ${route.provider}/${route.model}`,
    `Why now: ${pack.whyNow}`,
    `Why us: ${pack.whyUs}`,
    `Variants: ${pack.variants.length}`
  ].join("\n");
}

export { getHotspotPack as getStoredHotspotPack, getReviewQueue };
