import { getBrandStrategyPack, getHotspotPack, getHotspotSignals } from "@/lib/data";
import { HotspotPack, HotspotSignal } from "@/lib/domain/types";

export interface ContentPackExportBundle {
  filename: string;
  markdown: string;
  pack: HotspotPack;
  hotspot?: HotspotSignal;
  brandName: string;
}

function escapeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function buildMarkdown(bundle: {
  pack: HotspotPack;
  hotspot?: HotspotSignal;
  brandName: string;
}): string {
  const { pack, hotspot, brandName } = bundle;

  const header = [
    `# 热点内容包导出`,
    "",
    `- 品牌: ${brandName}`,
    `- 热点包: ${pack.id}`,
    `- 热点: ${hotspot?.title ?? pack.hotspotId}`,
    `- 当前审核状态: ${pack.status}`,
    `- 导出时间: ${new Date().toLocaleString("zh-CN")}`,
    ""
  ].join("\n");

  const context = [
    "## 热点背景",
    "",
    `- 为什么现在: ${pack.whyNow}`,
    `- 为什么和品牌相关: ${pack.whyUs}`,
    `- 审核人: ${pack.reviewedBy ?? pack.reviewOwner}`,
    `- 审核时间: ${pack.reviewedAt ? formatDate(pack.reviewedAt) : "未记录"}`,
    `- 审核备注: ${pack.reviewNote || "暂无"}`,
    ""
  ].join("\n");

  const variantSections = pack.variants
    .map((variant, index) =>
      [
        `## 内容 ${index + 1} / ${variant.track}`,
        "",
        `- 标题: ${variant.title}`,
        `- 角度: ${variant.angle}`,
        `- 格式: ${variant.format}`,
        `- 建议平台: ${variant.platforms.join(" / ")}`,
        `- 发布时间建议: ${variant.publishWindow}`,
        `- 封面钩子: ${variant.coverHook}`,
        "",
        "### 正文/脚本",
        "",
        variant.body,
        ""
      ].join("\n")
    )
    .join("\n");

  return [header, context, variantSections].join("\n");
}

export async function getContentPackExportBundle(
  packId: string
): Promise<ContentPackExportBundle | null> {
  const [pack, brand, hotspots] = await Promise.all([
    getHotspotPack(packId),
    getBrandStrategyPack(),
    getHotspotSignals()
  ]);

  if (!pack) {
    return null;
  }

  const hotspot = hotspots.find((item) => item.id === pack.hotspotId);
  const slugPart = escapeFilePart(hotspot?.title ?? pack.id) || "content-pack";
  const filename = `${pack.id}-${slugPart}.md`;
  const markdown = buildMarkdown({
    pack,
    hotspot,
    brandName: brand.name
  });

  return {
    filename,
    markdown,
    pack,
    hotspot,
    brandName: brand.name
  };
}
