"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function OneClickProductionButton({
  packId,
  compact = false,
  disabled = false,
  disabledReason
}: {
  packId: string;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function runOneClick() {
    if (disabled) {
      if (disabledReason) {
        setMessage(disabledReason);
      }
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/production/one-click", {
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
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "一键制作失败");
        return;
      }

      setMessage("已生成首版内容，正在跳转到内容深度制作台...");
      router.push(`/production-studio/${packId}`);
      router.refresh();
    });
  }

  return (
    <div className="subPanel productionQuickStart">
      <div className="listItem">
        <strong>{compact ? "一键制作" : "一键制作图文 + 视频"}</strong>
        <span className={`pill ${disabled ? "pill-neutral" : "pill-positive"}`}>
          {disabled ? "待通过" : "可执行"}
        </span>
      </div>

      {!compact ? (
        <p className="muted">
          {disabled
            ? disabledReason ?? "选题通过后可自动生成图文、视频、口播与字幕。"
            : "自动跑脚本、配图、视频、口播与字幕，并进入最终工作台。"}
        </p>
      ) : null}

      <div className="buttonRow">
        <button disabled={isPending || disabled} onClick={runOneClick} type="button">
          {isPending ? "制作中..." : compact ? "一键制作图文+视频" : "开始一键制作"}
        </button>
        <Link className="buttonLike subtleButton" href={`/production-studio/${packId}`}>
          打开制作台
        </Link>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
