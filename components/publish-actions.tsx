"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PublishQueueClearButton } from "@/components/publish-queue-clear-button";

export function PublishActions({
  packId,
  queuedCount,
  publishedCount,
  failedCount,
  compact = false
}: {
  packId: string;
  queuedCount: number;
  publishedCount: number;
  failedCount: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function queuePublish() {
    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/publish/${packId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scheduledAt: scheduledAt || undefined
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            jobs?: unknown[];
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "送入发布台失败");
        return;
      }

      const queued = payload.jobs?.length ?? 0;
      setMessage(`已送入发布台，共 ${queued} 条任务`);
      router.refresh();
    });
  }

  function runPublishNow() {
    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/publish/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          packId
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            published?: number;
            failed?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "执行发布动作失败");
        return;
      }

      setMessage(`执行完成：已发布 ${payload.published ?? 0}，失败 ${payload.failed ?? 0}`);
      router.refresh();
    });
  }

  return (
    <div className="subPanel publishActions">
      <div className="publishActionHeader">
        <div>
          <p className="eyebrow">执行动作</p>
          <strong>{compact ? "发布处理" : "发布与导出"}</strong>
        </div>
        <span className="pill pill-neutral">{queuedCount > 0 ? `已排队 ${queuedCount}` : "待进入发布台"}</span>
      </div>

      <div className="publishStats">
        <small>已发布 {publishedCount}</small>
        <small>失败 {failedCount}</small>
      </div>

      {!compact ? (
        <label className="field">
          <span>计划发布时间（可选）</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
      ) : null}

      <div className="buttonRow publishPrimaryActions">
        <button className="buttonLike primaryButton" disabled={isPending} onClick={runPublishNow} type="button">
          {failedCount > 0 ? "重新尝试" : "立即发布"}
        </button>
        <button className="buttonLike subtleButton" disabled={isPending} onClick={queuePublish} type="button">
          {failedCount > 0 ? "重新排入发布" : "加入发布台"}
        </button>
      </div>

      <div className="buttonRow publishSecondaryActions">
        <PublishQueueClearButton
          emptyLabel="当前这题没有待清空的发布任务"
          label={compact ? "清空待执行" : "清空这题待执行"}
          packId={packId}
        />
        <a className="buttonLike subtleButton" href={`/api/content-packs/${packId}/export?format=markdown`}>
          {compact ? "导出内容" : "导出 Markdown"}
        </a>
        {!compact ? (
          <a className="buttonLike subtleButton" href={`/api/content-packs/${packId}/export?format=json`} target="_blank">
            导出 JSON
          </a>
        ) : null}
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
