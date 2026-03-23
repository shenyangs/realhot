"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReviewStatus } from "@/lib/domain/types";

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  "needs-edit": "待改稿"
};

export function ReviewActions({
  packId,
  currentStatus,
  currentNote,
  defaultReviewer
}: {
  packId: string;
  currentStatus: ReviewStatus;
  currentNote?: string;
  defaultReviewer: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(currentNote ?? "");
  const [reviewer, setReviewer] = useState(defaultReviewer);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const primaryAction =
    currentStatus === "pending"
      ? { label: "通过并进入下游", status: "approved" as ReviewStatus }
      : currentStatus === "needs-edit"
        ? { label: "提交审核", status: "pending" as ReviewStatus }
        : null;

  const secondaryActions = [
    currentStatus !== "needs-edit"
      ? { label: "退回修改", status: "needs-edit" as ReviewStatus }
      : null,
    currentStatus === "approved"
      ? { label: "恢复待审核", status: "pending" as ReviewStatus }
      : null
  ].filter(Boolean) as Array<{ label: string; status: ReviewStatus }>;

  function submit(status: ReviewStatus) {
    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/review/${packId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          note,
          reviewer
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(payload?.error ?? "审核写回失败");
        return;
      }

      setMessage(`已更新为 ${status}`);
      router.refresh();
    });
  }

  return (
    <div className="subPanel reviewActions">
      <div className="reviewActionHeader">
        <div>
          <p className="eyebrow">审核动作</p>
          <strong>固定出口</strong>
        </div>
        <span className="pill pill-neutral">{reviewStatusLabels[currentStatus]}</span>
      </div>

      <label className="field">
        <span>审核人</span>
        <input
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
          placeholder="品牌市场负责人"
        />
      </label>

      <label className="field">
        <span>审核备注</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="记录修改意见、退回原因或通过备注"
          rows={4}
        />
      </label>

      <div className="buttonRow reviewActionButtons">
        {primaryAction ? (
          <button className="buttonLike primaryButton" disabled={isPending} onClick={() => submit(primaryAction.status)} type="button">
            {primaryAction.label}
          </button>
        ) : null}
        {secondaryActions.map((action) => (
          <button
            className="buttonLike subtleButton"
            disabled={isPending}
            key={action.status}
            onClick={() => submit(action.status)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
