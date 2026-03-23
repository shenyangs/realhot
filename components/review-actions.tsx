"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ReviewStatus } from "@/lib/domain/types";

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  "needs-edit": "待改稿"
};

interface ReviewerOption {
  value: string;
  description?: string;
}

export function ReviewActions({
  packId,
  currentStatus,
  currentNote,
  defaultReviewer,
  reviewerOptions
}: {
  packId: string;
  currentStatus: ReviewStatus;
  currentNote?: string;
  defaultReviewer: string;
  reviewerOptions: ReviewerOption[];
}) {
  const router = useRouter();
  const [note, setNote] = useState(currentNote ?? "");
  const [reviewer, setReviewer] = useState(defaultReviewer);
  const [isReviewerMenuOpen, setIsReviewerMenuOpen] = useState(false);
  const [reviewerError, setReviewerError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const reviewerFieldRef = useRef<HTMLDivElement>(null);

  const selectedReviewerOption =
    reviewerOptions.find((option) => option.value === reviewer) ??
    (reviewer ? { value: reviewer } : null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!reviewerFieldRef.current?.contains(event.target as Node)) {
        setIsReviewerMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReviewerMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
    const normalizedReviewer = reviewer.trim();

    if (!normalizedReviewer) {
      setReviewerError("请选择审核人后再提交");
      setMessage("");
      return;
    }

    startTransition(async () => {
      setReviewerError("");
      setMessage("");

      const response = await fetch(`/api/review/${packId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          note,
          reviewer: normalizedReviewer
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

      <div className="field reviewerField" ref={reviewerFieldRef}>
        <span>审核人</span>
        <button
          aria-expanded={isReviewerMenuOpen}
          aria-haspopup="listbox"
          className={`reviewerPickerButton ${isReviewerMenuOpen ? "reviewerPickerButtonOpen" : ""} ${reviewerError ? "reviewerPickerButtonError" : ""}`}
          onClick={() => {
            setIsReviewerMenuOpen((current) => !current);
            setReviewerError("");
          }}
          type="button"
        >
          <span className="reviewerPickerCopy">
            <strong>{selectedReviewerOption?.value || "请选择审核人"}</strong>
            <small>{selectedReviewerOption?.description ?? "根据审批规则自动匹配，可手动更换"}</small>
          </span>
          <span className="reviewerPickerAction">{reviewer ? "更换" : "选择"}</span>
        </button>

        {isReviewerMenuOpen ? (
          <div className="reviewerPickerMenu" role="listbox">
            {reviewerOptions.map((option) => {
              const isSelected = option.value === reviewer;

              return (
                <button
                  aria-selected={isSelected}
                  className={`reviewerPickerOption ${isSelected ? "reviewerPickerOptionSelected" : ""}`}
                  key={option.value}
                  onClick={() => {
                    setReviewer(option.value);
                    setReviewerError("");
                    setIsReviewerMenuOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="reviewerPickerOptionCopy">
                    <strong>{option.value}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {isSelected ? <span className="reviewerPickerCheck">已选</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="fieldHint">根据审批规则自动匹配，可手动更换</p>
        {reviewerError ? <p className="fieldError">{reviewerError}</p> : null}
      </div>

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
