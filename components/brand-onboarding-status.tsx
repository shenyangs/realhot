"use client";

import { useEffect, useState } from "react";
import {
  formatLocalTimestamp,
  getOnboardingStorageKey,
  type StoredOnboardingPayload
} from "@/lib/client/persistence";

export function BrandOnboardingStatus({
  brandName,
  variant = "pill"
}: {
  brandName: string;
  variant?: "pill" | "card";
}) {
  const [status, setStatus] = useState<StoredOnboardingPayload | null>(null);

  useEffect(() => {
    const key = getOnboardingStorageKey(brandName);
    const stored = window.localStorage.getItem(key);

    if (!stored) {
      return;
    }

    try {
      setStatus(JSON.parse(stored) as StoredOnboardingPayload);
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [brandName]);

  const title = status
    ? status.completed
      ? `已完成 ${status.completedSteps}/5 项`
      : `已完成 ${status.completedSteps}/5 项，仍在补充`
    : "当前未读取到本地接入记录";
  const description = status
    ? `最近更新：${formatLocalTimestamp(status.updatedAt)}`
    : "建议下一步：先补品牌基础、表达规则和近期动态";

  if (variant === "card") {
    return (
      <article className="panel summaryCard">
        <p className="eyebrow">接入状态</p>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
      </article>
    );
  }

  return (
    <div className="metaPill">
      <span>接入状态</span>
      <strong>{title}</strong>
      <small className="muted">{description}</small>
    </div>
  );
}
