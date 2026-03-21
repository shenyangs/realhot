import { hotspotSignals } from "@/lib/data/mock";
import { BrandStrategyPack, HotspotSignal } from "@/lib/domain/types";

export interface PrioritizedHotspot extends HotspotSignal {
  priorityScore: number;
}

export function prioritizeHotspots(
  brand: BrandStrategyPack,
  signals: HotspotSignal[] = hotspotSignals
): PrioritizedHotspot[] {
  return signals
    .map((signal) => {
      const topicMatches = brand.topics.filter((topic) =>
        `${signal.title} ${signal.summary}`.toLowerCase().includes(topic.toLowerCase())
      ).length;

      const priorityScore =
        signal.relevanceScore * 0.35 +
        signal.industryScore * 0.3 +
        signal.velocityScore * 0.25 -
        signal.riskScore * 0.1 +
        topicMatches * 3;

      return {
        ...signal,
        priorityScore: Math.round(priorityScore)
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore);
}
