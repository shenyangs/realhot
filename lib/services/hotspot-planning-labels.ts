import type { HotspotSignal } from "@/lib/domain/types";

export type HotspotBorrowStyle = "情绪借势" | "观点借势" | "产品借势" | "审美借势";
export type HotspotWindowStage = "预热期" | "爆发期" | "余热期";

function buildSearchText(signal: Pick<HotspotSignal, "title" | "summary" | "source">) {
  return `${signal.title} ${signal.summary} ${signal.source}`.toLowerCase();
}

export function getHotspotBorrowStyle(signal: Pick<HotspotSignal, "title" | "summary" | "source">): HotspotBorrowStyle {
  const text = buildSearchText(signal);

  if (
    /奥斯卡|春晚|红毯|格莱美|文娱|审美|作品|时尚|met gala/i.test(text)
  ) {
    return "审美借势";
  }

  if (
    /618|双11|发布会|wwdc|新品|产品|开学季|种草|转化|购买|消费决策|科技发布型/i.test(text)
  ) {
    return "产品借势";
  }

  if (
    /微信公开课|小红书|平台生态|规则|生态|趋势|复盘|年终|观点|行业变化|科技发布型|平台生态型/i.test(text)
  ) {
    return "观点借势";
  }

  if (
    /世界杯|nba|奥运|赛事|春晚|高考|国庆|五一|清明|暑期|节庆|全民|情绪|国民文化型|全民赛事型/i.test(text)
  ) {
    return "情绪借势";
  }

  return "观点借势";
}

export function getHotspotWindowStage(
  signal: Pick<HotspotSignal, "summary" | "detectedAt" | "velocityScore">
): HotspotWindowStage {
  const text = signal.summary.toLowerCase();
  const targetTimestamp = Date.parse(signal.detectedAt);

  if (!Number.isNaN(targetTimestamp) && /节点时间:|窗口判断:|预热|余热|爆发窗口|进入节点/.test(text)) {
    const diffDays = Math.round((targetTimestamp - Date.now()) / 86_400_000);

    if (diffDays >= 2) {
      return "预热期";
    }

    if (diffDays >= -1) {
      return "爆发期";
    }

    return "余热期";
  }

  if (signal.velocityScore >= 85) {
    return "爆发期";
  }

  if (signal.velocityScore >= 70) {
    return "预热期";
  }

  return "余热期";
}

export function getHotspotPlanningLabels(
  signal: Pick<HotspotSignal, "title" | "summary" | "source" | "detectedAt" | "velocityScore">
) {
  return {
    borrowStyle: getHotspotBorrowStyle(signal),
    windowStage: getHotspotWindowStage(signal)
  };
}
