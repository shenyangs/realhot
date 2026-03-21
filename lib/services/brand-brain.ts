import { BrandStrategyPack } from "@/lib/domain/types";

export function getBrandBrainSummary(brand: BrandStrategyPack): string[] {
  return [
    `${brand.name} 定位于 ${brand.sector}，核心卖点是 ${brand.positioning[0]}。`,
    `品牌目前重点传播主题包括 ${brand.topics.join("、")}。`,
    `近期可用于热点关联的动作包括 ${brand.recentMoves.join("；")}。`
  ];
}
