"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Platform, ReviewStatus } from "@/lib/domain/types";

type PriorityLabel = "高" | "中" | "低";

interface ReviewQueueBatchItem {
  id: string;
  status: ReviewStatus;
  reviewOwner: string;
  variantId?: string;
  variantTitle: string;
  publishWindow?: string;
  firstPlatform?: Platform;
  priorityLabel: PriorityLabel;
}

function buildReviewHref(input: {
  status?: string;
  q?: string;
  pack?: string;
  variant?: string;
  platform?: string;
}) {
  const params = new URLSearchParams();

  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }

  if (input.q) {
    params.set("q", input.q);
  }

  if (input.pack) {
    params.set("pack", input.pack);
  }

  if (input.variant) {
    params.set("variant", input.variant);
  }

  if (input.platform) {
    params.set("platform", input.platform);
  }

  const query = params.toString();
  return (query ? `/review?${query}` : "/review") as Route;
}

function getPackStatusTone(status: ReviewStatus) {
  if (status === "approved") {
    return "positive";
  }

  if (status === "needs-edit") {
    return "warning";
  }

  return "neutral";
}

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  "needs-edit": "待改稿"
};

export function ReviewQueueBatchList({
  items,
  activePackId,
  statusFilter,
  searchQuery,
  canBatchReview
}: {
  items: ReviewQueueBatchItem[];
  activePackId: string;
  statusFilter: string;
  searchQuery: string;
  canBatchReview: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectableIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => selectableIds.includes(id)));
  }, [selectableIds]);

  function toggleOne(packId: string) {
    setSelectedIds((current) => (current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId]));
  }

  function toggleAll() {
    setSelectedIds((current) => (allSelected ? current.filter((id) => !selectableIds.includes(id)) : [...new Set([...current, ...selectableIds])]));
  }

  function runBatch(status: "approved" | "needs-edit") {
    if (!canBatchReview || selectedCount === 0) {
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/review/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          packIds: selectedIds,
          status
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            updatedCount?: number;
            failedIds?: string[];
            failedReasons?: Record<string, string>;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "批量审核失败");
        return;
      }

      const updatedCount = payload.updatedCount ?? 0;
      const failedIds = payload.failedIds ?? [];
      const actionLabel = status === "approved" ? "通过" : "打回";

      if (failedIds.length > 0) {
        setSelectedIds(failedIds);
        setMessage(`已批量${actionLabel} ${updatedCount} 条，另有 ${failedIds.length} 条失败，请重试或刷新后重试。`);
      } else {
        setSelectedIds([]);
        setMessage(`已批量${actionLabel} ${updatedCount} 条。`);
      }

      router.refresh();
    });
  }

  return (
    <>
      {canBatchReview ? (
        <div className="reviewBatchToolbar">
          <div className="reviewBatchMeta">
            <button className="buttonLike subtleButton" disabled={isPending || selectableIds.length === 0} onClick={toggleAll} type="button">
              {allSelected ? "取消全选" : "全选当前列表"}
            </button>
            <span className="muted">已选 {selectedCount} 条</span>
          </div>
          <div className="buttonRow reviewBatchActions">
            <button
              className="buttonLike primaryButton"
              disabled={isPending || selectedCount === 0}
              onClick={() => runBatch("approved")}
              type="button"
            >
              {isPending ? "处理中..." : "批量通过"}
            </button>
            <button
              className="buttonLike subtleButton"
              disabled={isPending || selectedCount === 0}
              onClick={() => runBatch("needs-edit")}
              type="button"
            >
              批量打回修改
            </button>
          </div>
        </div>
      ) : null}

      <div className="reviewTaskListSimple topicQueueList">
        {items.map((pack) => {
          const isActive = pack.id === activePackId;
          const isSelected = selectedIds.includes(pack.id);

          return (
            <div
              className={`reviewTaskRow reviewLeanTaskRow reviewSelectableRow ${isActive ? "reviewTaskRowActive" : ""} ${isSelected ? "reviewTaskRowChecked" : ""}`}
              key={pack.id}
            >
              {canBatchReview ? (
                <label className="reviewRowCheckbox">
                  <input checked={isSelected} onChange={() => toggleOne(pack.id)} type="checkbox" />
                </label>
              ) : null}

              <Link
                className="reviewTaskRowLink"
                href={buildReviewHref({
                  status: statusFilter,
                  q: searchQuery,
                  pack: pack.id,
                  variant: pack.variantId,
                  platform: pack.firstPlatform
                })}
              >
                <div className="reviewTaskRowMain">
                  <strong className="reviewTaskTitle">{pack.variantTitle}</strong>
                  <p className="muted reviewTaskSummary">
                    {pack.reviewOwner} · {pack.publishWindow ?? "未设置发布时间"}
                  </p>
                </div>
                <div className="reviewTaskRowMeta reviewLeanTaskMeta">
                  <span className={`pill pill-${getPackStatusTone(pack.status)}`}>{reviewStatusLabels[pack.status]}</span>
                  <small className="muted">优先级 {pack.priorityLabel}</small>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </>
  );
}
