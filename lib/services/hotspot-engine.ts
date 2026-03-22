import { hotspotSignals } from "@/lib/data/mock";
import { BrandStrategyPack, HotspotSignal } from "@/lib/domain/types";

export interface PrioritizedHotspot extends HotspotSignal {
  priorityScore: number;
  brandFitScore: number;
}

function splitKeywordPhrases(values: string[]): string[] {
  return values
    .flatMap((value) =>
      value
        .split(/[\n,，、;；|/]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2)
    )
    .filter((value, index, array) => array.indexOf(value) === index);
}

function countPhraseMatches(text: string, phrases: string[]) {
  return phrases.filter((phrase) => text.includes(phrase.toLowerCase())).length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateBrandFitScore(brand: BrandStrategyPack, signal: HotspotSignal): number {
  const searchableText = [signal.title, signal.summary, signal.source, ...signal.reasons].join(" ").toLowerCase();
  const topicPhrases = splitKeywordPhrases(brand.topics);
  const sectorPhrases = splitKeywordPhrases([brand.sector]);
  const positioningPhrases = splitKeywordPhrases(brand.positioning);
  const audiencePhrases = splitKeywordPhrases(brand.audiences);
  const recentMovePhrases = splitKeywordPhrases(brand.recentMoves);
  const sourcePhrases = splitKeywordPhrases(brand.sources.map((item) => `${item.label} ${item.value}`));
  const competitorPhrases = splitKeywordPhrases(brand.competitors);
  const brandNameMatches = searchableText.includes(brand.name.toLowerCase()) ? 1 : 0;

  const topicMatches = countPhraseMatches(searchableText, topicPhrases);
  const sectorMatches = countPhraseMatches(searchableText, sectorPhrases);
  const positioningMatches = countPhraseMatches(searchableText, positioningPhrases);
  const audienceMatches = countPhraseMatches(searchableText, audiencePhrases);
  const recentMoveMatches = countPhraseMatches(searchableText, recentMovePhrases);
  const sourceMatches = countPhraseMatches(searchableText, sourcePhrases);
  const competitorMatches = countPhraseMatches(searchableText, competitorPhrases);

  const structuralBase =
    signal.relevanceScore * 0.46 +
    signal.industryScore * 0.16 +
    signal.velocityScore * 0.08 -
    signal.riskScore * 0.06;

  const semanticBoost =
    topicMatches * 9 +
    sectorMatches * 6 +
    positioningMatches * 5 +
    audienceMatches * 3 +
    recentMoveMatches * 4 +
    sourceMatches * 2 +
    competitorMatches * 2 +
    brandNameMatches * 8;

  const intentBoost =
    signal.kind === "industry" ? 5 : signal.kind === "brand" ? 4 : 1;

  return clampScore(structuralBase + semanticBoost + intentBoost);
}

export function prioritizeHotspots(
  brand: BrandStrategyPack,
  signals: HotspotSignal[] = hotspotSignals
): PrioritizedHotspot[] {
  return signals
    .map((signal) => {
      const brandFitScore = calculateBrandFitScore(brand, signal);
      const priorityScore = clampScore(
        brandFitScore * 0.6 +
          signal.velocityScore * 0.2 +
          signal.industryScore * 0.15 -
          signal.riskScore * 0.08 +
          (signal.recommendedAction === "ship-now" ? 6 : signal.recommendedAction === "watch" ? 2 : -4)
      );

      return {
        ...signal,
        brandFitScore,
        priorityScore
      };
    })
    .sort((left, right) => {
      if (right.brandFitScore !== left.brandFitScore) {
        return right.brandFitScore - left.brandFitScore;
      }

      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return Date.parse(right.detectedAt) - Date.parse(left.detectedAt);
    });
}
