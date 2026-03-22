import { getBrandStrategyPack, getHotspotPack, getHotspotSignals } from "@/lib/data";
import { HotspotPack, Platform } from "@/lib/domain/types";
import { getChinaMarketPromptLines } from "@/lib/services/china-market";
import { runModelTask } from "@/lib/services/model-router";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

function buildLocalPreview(pack: HotspotPack) {
  return pack.variants
    .map((variant, index) =>
      [
        `${index + 1}. ${variant.title}`,
        `类型: ${variant.track} / ${variant.format}`,
        `平台: ${variant.platforms.map((platform) => platformLabels[platform]).join(" / ")}`,
        `发布时间: ${variant.publishWindow}`,
        `切入角度: ${variant.angle}`,
        `封面钩子: ${variant.coverHook}`,
        `正文: ${variant.body}`
      ].join("\n")
    )
    .join("\n\n---\n\n");
}

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
    `品牌定位: ${brand.positioning.join("；")}`,
    `品牌语气: ${brand.tone.join("、")}`,
    `品牌禁区: ${brand.redLines.join("；")}`,
    `热点标题: ${hotspot?.title ?? "unknown"}`,
    `热点摘要: ${hotspot?.summary ?? "unknown"}`,
    "内容市场要求:",
    ...getChinaMarketPromptLines().map((line) => `- ${line}`),
    "输出要求:",
    "- 生成 2 条快反内容和 2 条观点内容，适配小红书、公众号、视频号、抖音。",
    "- 文风必须是中国平台专家级表达：有判断、有推理、有动作，不要新闻复述。",
    "- 字数至少达到主流创作者水准：快反图文 260+、口播稿 420+、公众号观点文 900+、观点贴 520+。",
    "- 只用简体中文输出，不要英文腔，不要泛泛口号。"
  ].join("\n");

  let output: string;

  try {
    output = await runModelTask("content-generation", prompt);
  } catch (error) {
    output =
      error instanceof Error
        ? `${buildLocalPreview(pack)}\n\n[AI_PREVIEW_UNAVAILABLE]\n${error.message}\n\n已回退为本地预览内容，待上游模型恢复后可重试。`
        : `${buildLocalPreview(pack)}\n\n[AI_PREVIEW_UNAVAILABLE]\nUnknown AI error\n\n已回退为本地预览内容，待上游模型恢复后可重试。`;
  }

  return {
    pack,
    prompt,
    output
  };
}
