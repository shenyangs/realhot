"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReviewStatus } from "@/lib/domain/types";

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
      <div className="listItem">
        <strong>审核操作</strong>
        <span className="pill pill-neutral">{currentStatus}</span>
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

      <div className="buttonRow">
        <button disabled={isPending} onClick={() => submit("approved")} type="button">
          通过
        </button>
        <button disabled={isPending} onClick={() => submit("needs-edit")} type="button">
          退回修改
        </button>
        <button disabled={isPending} onClick={() => submit("pending")} type="button">
          恢复待审核
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
