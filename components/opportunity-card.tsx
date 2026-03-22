"use client";

import { useMemo, useState } from "react";
import { HotspotActionButton } from "@/components/hotspot-action-button";

function truncateDisplayText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(cleaned);

  if (chars.length <= maxLength) {
    return cleaned;
  }

  return `${chars.slice(0, maxLength).join("").trimEnd()}...`;
}

export function OpportunityCard({
  hotspotId,
  title,
  summary,
  source,
  detectedAt,
  recommendedAction,
  angle,
  windowLabel,
  relevanceReason,
  packId,
  variantId,
  platform
}: {
  hotspotId: string;
  title: string;
  summary: string;
  source: string;
  detectedAt: string;
  recommendedAction: "ship-now" | "watch" | "discard";
  angle: string;
  windowLabel: string;
  relevanceReason: string;
  packId?: string;
  variantId?: string;
  platform?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const display = useMemo(
    () => ({
      title: expanded ? title : truncateDisplayText(title, 52),
      summary: expanded ? summary : truncateDisplayText(summary, 150),
      source: expanded ? source : truncateDisplayText(source, 32)
    }),
    [expanded, source, summary, title]
  );

  return (
    <article className={`opportunityCard opportunityCardDense ${expanded ? "opportunityCardExpanded" : ""}`}>
      <div className="opportunityHeader">
        <span className={`pill pill-${recommendedAction === "ship-now" ? "positive" : "warning"}`}>
          {recommendedAction === "ship-now" ? "建议跟进" : "继续观察"}
        </span>
        <small className="muted opportunityTime">{detectedAt}</small>
      </div>

      <div className="stack compactStack">
        <h3 className="opportunityTitle">{display.title}</h3>
        <p className="muted opportunitySummary">{display.summary}</p>
      </div>

      <button
        aria-expanded={expanded}
        className="opportunityToggle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? "恢复短版" : "展开更多"}
      </button>

      <div className="opportunityFacts">
        <div>
          <span>建议角度</span>
          <strong className="opportunityFactValue">{angle}</strong>
        </div>
        <div>
          <span>执行窗口</span>
          <strong className="opportunityFactValue">{windowLabel}</strong>
        </div>
        <div>
          <span>品牌相关性</span>
          <strong className="opportunityFactValue">{relevanceReason}</strong>
        </div>
      </div>

      <div className="opportunityFooter">
        <span className="sourceLabel">{display.source}</span>
        <HotspotActionButton
          hotspotId={hotspotId}
          packId={packId}
          platform={platform}
          variantId={variantId}
        />
      </div>
    </article>
  );
}
