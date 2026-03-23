"use client";

import { useState, useTransition } from "react";
import { HotspotInsightTrigger } from "@/components/hotspot-insight-trigger";

interface HotspotDecisionBasisProps {
  hotspotId: string;
  fallbackReasons: {
    whyNow: string;
    whyBrand: string;
    angle: string;
  };
  sourceLinks: Array<{
    key: string;
    label: string;
    href: string;
  }>;
}

interface HotspotInsightPayload {
  productFocus: string;
  connectionPoint: string;
  communicationStrategy: string;
  planningDirection: string;
  recommendedFormat: string;
  planningScore: string;
  planningComment: string;
  riskNote: string;
}

function pickFirstSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  const stopIndex = normalized.search(/[。！？!?]/);

  if (stopIndex === -1) {
    return normalized;
  }

  return normalized.slice(0, stopIndex + 1).trim();
}

function extractPlanningPoint(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const numbered = lines.find((line) => /^\d+[).、．]/.test(line) || /^\d+\s*[\/.]/.test(line));

  if (numbered) {
    return numbered.replace(/^\d+[).、．]\s*/, "").replace(/^\d+\s*[\/.]\s*/, "").trim();
  }

  return pickFirstSentence(lines.join(" "));
}

function mapInsightToReasons(payload: HotspotInsightPayload, fallback: HotspotDecisionBasisProps["fallbackReasons"]) {
  return {
    whyNow: pickFirstSentence(payload.communicationStrategy) || fallback.whyNow,
    whyBrand: pickFirstSentence(payload.connectionPoint) || fallback.whyBrand,
    angle: extractPlanningPoint(payload.planningDirection) || fallback.angle
  };
}

export function HotspotDecisionBasis({ hotspotId, fallbackReasons, sourceLinks }: HotspotDecisionBasisProps) {
  const [reasons, setReasons] = useState(fallbackReasons);
  const [isAiLoaded, setIsAiLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function loadAiReasons() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/hotspots/insight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          hotspotId
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            insight?: HotspotInsightPayload;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.insight) {
        setMessage(payload?.error ?? "AI 判断暂不可用，已展示基础依据");
        return;
      }

      setReasons(mapInsightToReasons(payload.insight, fallbackReasons));
      setIsAiLoaded(true);
    });
  }

  return (
    <details
      className="hotspotBoardDetails"
      onToggle={(event) => {
        const target = event.currentTarget as HTMLDetailsElement;

        if (target.open && !isAiLoaded && !isPending) {
          loadAiReasons();
        }
      }}
    >
      <summary>查看判断依据{isAiLoaded ? "（AI）" : ""}</summary>
      <div className="hotspotBoardDetailsBody reviewContextCopy">
        <p>
          <strong>为什么现在值得做：</strong>
          {isPending ? "正在生成该条热点的 AI 判断..." : reasons.whyNow}
        </p>
        <p>
          <strong>为什么和品牌有关：</strong>
          {isPending ? "正在分析品牌结合路径..." : reasons.whyBrand}
        </p>
        <p>
          <strong>可能的传播角度：</strong>
          {isPending ? "正在提炼该条热点的执行切口..." : reasons.angle}
        </p>

        <div className="inlineActions">
          <button className="buttonLike subtleButton" disabled={isPending} onClick={loadAiReasons} type="button">
            {isPending ? "AI判断中..." : isAiLoaded ? "重新AI判断" : "AI单独判断"}
          </button>
          <span className="muted">每条热点独立判断，不复用固定模板。</span>
        </div>

        {message ? <p className="muted inlineActionMessage">{message}</p> : null}

        <div className="hotspotDetailSourceLinks">
          {sourceLinks.map((link) => (
            <a className="tag" href={link.href} key={link.key} rel="noreferrer" target="_blank">
              查看 {link.label}
            </a>
          ))}
        </div>
        <HotspotInsightTrigger hotspotId={hotspotId} />
      </div>
    </details>
  );
}
