"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PublishActions({
  packId,
  queuedCount,
  publishedCount,
  failedCount
}: {
  packId: string;
  queuedCount: number;
  publishedCount: number;
  failedCount: number;
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
        setMessage(payload?.error ?? "加入发布队列失败");
        return;
      }

      const queued = payload.jobs?.length ?? 0;
      setMessage(`已加入发布队列，共 ${queued} 条任务`);
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
        setMessage(payload?.error ?? "执行发布失败");
        return;
      }

      setMessage(`执行完成：已发布 ${payload.published ?? 0}，失败 ${payload.failed ?? 0}`);
      router.refresh();
    });
  }

  return (
    <div className="subPanel publishActions">
      <div className="listItem">
        <strong>发布/导出</strong>
        <span className="pill pill-neutral">已排队 {queuedCount}</span>
      </div>

      <div className="publishStats">
        <small>已发布 {publishedCount}</small>
        <small>失败 {failedCount}</small>
      </div>

      <label className="field">
        <span>计划发布时间（可选）</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
      </label>

      <div className="buttonRow">
        <button disabled={isPending} onClick={queuePublish} type="button">
          加入发布队列
        </button>
        <button disabled={isPending} onClick={runPublishNow} type="button">
          立即执行发布
        </button>
        <a className="buttonLike" href={`/api/content-packs/${packId}/export?format=markdown`}>
          导出 Markdown
        </a>
        <a className="buttonLike" href={`/api/content-packs/${packId}/export?format=json`} target="_blank">
          导出 JSON
        </a>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
