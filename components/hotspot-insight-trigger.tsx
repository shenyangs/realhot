"use client";

import { useState, useTransition } from "react";

interface HotspotInsightTriggerProps {
  hotspotId: string;
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

export function HotspotInsightTrigger({ hotspotId }: HotspotInsightTriggerProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<HotspotInsightPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  function fetchInsight() {
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
        setMessage(payload?.error ?? "生成深挖建议失败");
        return;
      }

      setResult(payload.insight);
    });
  }

  return (
    <div className="hotspotInsightBlock">
      <div className="hotspotInsightActions">
        <button className="buttonLike subtleButton" disabled={isPending} onClick={fetchInsight} type="button">
          {isPending ? "正在补充判断..." : "补充判断依据"}
        </button>
        <span className="muted">按需补充单条热点的品牌结合与风险判断。</span>
      </div>

      {message ? <p className="muted inlineActionMessage">{message}</p> : null}

      {result ? (
        <div className="hotspotInsightCard">
          <div className="tagRow">
            <span className="tag">建议重点：{result.productFocus}</span>
            <span className="tag">策划评分：{result.planningScore}</span>
          </div>
          <div className="hotspotInsightList">
            <div>
              <span>结合抓手</span>
              <p className="hotspotInsightText">{result.connectionPoint}</p>
            </div>
            <div>
              <span>传播策略</span>
              <p className="hotspotInsightText">{result.communicationStrategy}</p>
            </div>
            <div>
              <span>策划方向</span>
              <p className="hotspotInsightText">{result.planningDirection}</p>
            </div>
            <div>
              <span>推荐形式</span>
              <p className="hotspotInsightText">{result.recommendedFormat}</p>
            </div>
            <div>
              <span>策划评价</span>
              <p className="hotspotInsightText">{result.planningComment}</p>
            </div>
            <div>
              <span>风险提醒</span>
              <p className="hotspotInsightText">{result.riskNote}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
