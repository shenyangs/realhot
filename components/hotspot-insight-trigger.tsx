"use client";

import { useState, useTransition } from "react";

interface HotspotInsightTriggerProps {
  hotspotId: string;
  disabled?: boolean;
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

export function HotspotInsightTrigger({ hotspotId, disabled = false }: HotspotInsightTriggerProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<HotspotInsightPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  function fetchInsight() {
    if (disabled) {
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
        setMessage(payload?.error ?? "生成深挖建议失败");
        return;
      }

      setResult(payload.insight);
    });
  }

  return (
    <div className="hotspotInsightBlock">
      <div className="hotspotInsightActions">
        <button className="buttonLike subtleButton" disabled={disabled || isPending} onClick={fetchInsight} type="button">
          {disabled ? "试用模式不可用" : isPending ? "正在生成专业判断..." : "补充专业判断"}
        </button>
        <span className="muted">
          {disabled ? "试用模式仅展示静态热点信息。" : "按需补充该热点的品牌结合路径、执行策略与风险边界。"}
        </span>
      </div>

      {message ? <p className="muted inlineActionMessage">{message}</p> : null}

      {result ? (
        <div className="hotspotInsightCard">
          <div className="tagRow">
            <span className="tag">策略焦点：{result.productFocus}</span>
            <span className="tag">策划评分：{result.planningScore}</span>
          </div>
          <div className="hotspotInsightList">
            <div>
              <span>品牌结合路径</span>
              <p className="hotspotInsightText">{result.connectionPoint}</p>
            </div>
            <div>
              <span>传播策略建议</span>
              <p className="hotspotInsightText">{result.communicationStrategy}</p>
            </div>
            <div>
              <span>执行切口</span>
              <p className="hotspotInsightText">{result.planningDirection}</p>
            </div>
            <div>
              <span>渠道与载体建议</span>
              <p className="hotspotInsightText">{result.recommendedFormat}</p>
            </div>
            <div>
              <span>策略评价</span>
              <p className="hotspotInsightText">{result.planningComment}</p>
            </div>
            <div>
              <span>风险与边界</span>
              <p className="hotspotInsightText">{result.riskNote}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
