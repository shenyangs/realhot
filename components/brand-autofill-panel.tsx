"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  formatLocalTimestamp,
  getOnboardingStorageKey,
  type StoredOnboardingPayload
} from "@/lib/client/persistence";
import type { BrandAutofillDraft, BrandAutofillReference, BrandAutofillRoute } from "@/lib/domain/brand-autofill";
import type { BrandStrategyPack } from "@/lib/domain/types";

export interface BrandAutofillPayload {
  route: BrandAutofillRoute;
  strategy: BrandStrategyPack;
  draft: BrandAutofillDraft;
  researchSummary: string;
  confidenceNote: string;
  references: BrandAutofillReference[];
  updatedAt: string;
}

interface BrandAutofillPanelProps {
  initialBrandName: string;
  compact?: boolean;
  refreshAfterApply?: boolean;
  onApplied?: (payload: BrandAutofillPayload) => void;
}

function countCompletedSteps(draft: BrandAutofillDraft) {
  let count = 0;

  if (draft.basic.brandName && draft.basic.sector && draft.basic.slogan && draft.basic.audiences) {
    count += 1;
  }

  if (draft.goals.objective && draft.goals.primaryPlatforms && draft.goals.topics) {
    count += 1;
  }

  if (draft.rules.tone && draft.rules.redLines && draft.rules.competitors) {
    count += 1;
  }

  if (draft.materials.length > 0) {
    count += 1;
  }

  if (draft.recent.trim()) {
    count += 1;
  }

  return count;
}

function resolveRouteLabel(route: BrandAutofillRoute): string {
  if (route.provider === "fallback") {
    return "本地草稿";
  }

  return "AI 检索引擎";
}

export function BrandAutofillPanel({
  initialBrandName,
  compact = false,
  refreshAfterApply = true,
  onApplied
}: BrandAutofillPanelProps) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initialBrandName);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<BrandAutofillPayload | null>(null);
  const [isPending, startTransition] = useTransition();
  const buttonLabel = useMemo(() => {
    if (isPending) {
      return "检索中...";
    }

    return "AI 填写";
  }, [isPending]);

  function persistDraft(payload: BrandAutofillPayload) {
    const completedSteps = countCompletedSteps(payload.draft);
    const storedPayload: StoredOnboardingPayload = {
      stepIndex: 0,
      completed: completedSteps >= 5,
      completedSteps,
      updatedAt: payload.updatedAt,
      basic: payload.draft.basic,
      goals: payload.draft.goals,
      rules: payload.draft.rules,
      materials: payload.draft.materials,
      recent: payload.draft.recent
    };

    window.localStorage.setItem(
      getOnboardingStorageKey(payload.strategy.name),
      JSON.stringify(storedPayload)
    );
  }

  function applyAutofill() {
    const nextBrandName = brandName.trim();

    if (!nextBrandName) {
      setMessage("请先填写品牌名称");
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/brands/autofill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          brandName: nextBrandName
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | ({
            ok?: boolean;
            error?: string;
          } & Partial<BrandAutofillPayload>)
        | null;

      if (!response.ok || !payload?.ok || !payload.strategy || !payload.draft || !payload.route) {
        setMessage(payload?.error ?? "品牌深度填写失败");
        return;
      }

      const nextResult: BrandAutofillPayload = {
        route: payload.route,
        strategy: payload.strategy,
        draft: payload.draft,
        researchSummary: payload.researchSummary ?? "",
        confidenceNote: payload.confidenceNote ?? "",
        references: payload.references ?? [],
        updatedAt: payload.updatedAt ?? new Date().toISOString()
      };

      setBrandName(nextResult.strategy.name);
      setResult(nextResult);
      persistDraft(nextResult);
      onApplied?.(nextResult);

      if (refreshAfterApply) {
        router.refresh();
      }
    });
  }

  return (
    <section className={`panel brandAutofillPanel ${compact ? "brandAutofillPanelCompact" : ""}`}>
      <div className="brandAutofillHeader">
        <div>
          <p className="eyebrow">AI 填写</p>
          <h3>品牌草稿</h3>
          <p className="muted">
            基于公开资料生成一版品牌草稿。
          </p>
        </div>
        {!compact ? <span className="pill pill-neutral">公开资料优先</span> : null}
      </div>

      <div className="brandAutofillControls">
        <label className="field">
          <span>品牌名称</span>
          <input
            onChange={(event) => setBrandName(event.target.value)}
            placeholder="例如：Midjourney、喜茶、影石 Insta360"
            value={brandName}
          />
        </label>
        <button className="buttonLike primaryButton" disabled={isPending} onClick={applyAutofill} type="button">
          {buttonLabel}
        </button>
      </div>

      <div className="brandAutofillMeta">
        <span className="muted">生成后仍可继续手动调整。</span>
        {result ? <span className="muted">最近回填：{formatLocalTimestamp(result.updatedAt)}</span> : null}
      </div>

      {message ? <p className="muted">{message}</p> : null}

      {result ? (
        <div className="brandAutofillResult">
          <div className="tagRow">
            <span className="tag">品牌：{result.strategy.name}</span>
            <span className="tag">行业：{result.strategy.sector}</span>
            <span className="tag">来源：{resolveRouteLabel(result.route)}</span>
          </div>

          <div className="brandAutofillSummary">
            <article className="subPanel">
              <strong>本次结果</strong>
              <p className="muted">{result.researchSummary}</p>
            </article>
            <article className="subPanel">
              <strong>校对建议</strong>
              <p className="muted">{result.confidenceNote}</p>
            </article>
          </div>

          {result.references.length > 0 ? (
            <div className="brandAutofillReferenceList">
              {result.references.map((item) => (
                <a
                  className="brandAutofillReference"
                  href={item.url}
                  key={`${item.title}:${item.url}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <strong>{item.title}</strong>
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ) : null}

          {!compact ? (
            <div className="buttonRow">
              <Link className="buttonLike subtleButton" href="/onboarding">
                查看接入表单
              </Link>
              <Link className="buttonLike subtleButton" href="/brands">
                查看品牌底盘
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
