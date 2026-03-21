import { getBrandStrategyPack, getHotspotPack, getHotspotSignals } from "@/lib/data";
import { HotspotPack } from "@/lib/domain/types";
import { getChinaMarketPromptLines } from "@/lib/services/china-market";
import { runModelTask } from "@/lib/services/model-router";

export async function generatePackPreview(packId: string): Promise<{
  pack: HotspotPack;
  prompt: string;
  output: string;
}> {
  const pack = await getHotspotPack(packId);

  if (!pack) {
    throw new Error(`Unknown hotspot pack: ${packId}`);
  }

  const [brand, signals] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  const hotspot = signals.find((signal) => signal.id === pack.hotspotId);

  const prompt = [
    `品牌名称: ${brand.name}`,
    `品牌主题: ${brand.topics.join("、")}`,
    `品牌禁区: ${brand.redLines.join("；")}`,
    `热点标题: ${hotspot?.title ?? "unknown"}`,
    `热点摘要: ${hotspot?.summary ?? "unknown"}`,
    "内容市场要求:",
    ...getChinaMarketPromptLines().map((line) => `- ${line}`),
    "输出要求: 生成 2 条快反内容和 2 条观点内容，适配小红书、公众号、视频号、抖音。"
  ].join("\n");

  const output = await runModelTask("content-generation", prompt);

  return {
    pack,
    prompt,
    output
  };
}
