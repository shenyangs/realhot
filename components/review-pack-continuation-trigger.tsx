"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StagedTaskStatusBlock } from "@/components/staged-task-status-block";

function getAttemptStorageKey(packId: string) {
  return `review-pack-continue:${packId}`;
}

export function ReviewPackContinuationTrigger({
  packId,
  currentVariantCount,
  targetVariantCount = 4
}: {
  packId: string;
  currentVariantCount: number;
  targetVariantCount?: number;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const shouldContinue = currentVariantCount < targetVariantCount;

  useEffect(() => {
    if (!shouldContinue) {
      setHasAttempted(true);
      return;
    }

    const attempted = window.sessionStorage.getItem(getAttemptStorageKey(packId));
    setHasAttempted(Boolean(attempted));
  }, [packId, shouldContinue]);

  async function continuePack(trigger: "auto" | "manual") {
    if (!shouldContinue || isContinuing) {
      return;
    }

    try {
      setIsContinuing(true);
      setHasAttempted(true);
      window.sessionStorage.setItem(getAttemptStorageKey(packId), "1");
      setMessage(
        trigger === "auto"
          ? "已开始补剩余平台方案，稍后会自动刷新当前审核页。"
          : "正在补剩余平台方案，请稍等。"
      );

      const response = await fetch(`/api/content-packs/${packId}/continue`, {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            pack?: {
              variants?: Array<unknown>;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "补全剩余方案失败，请手动重试。");
        return;
      }

      const nextCount = Array.isArray(payload?.pack?.variants) ? payload.pack.variants.length : currentVariantCount;
      setMessage(
        nextCount > currentVariantCount
          ? `已补齐剩余方案，当前共有 ${nextCount} 条可审内容。`
          : "这条选题当前只保留主稿，不再继续补额外变体。"
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补全剩余方案失败，请稍后重试。");
    } finally {
      setIsContinuing(false);
    }
  }

  useEffect(() => {
    if (!shouldContinue || hasAttempted || isContinuing || !triggerRef.current) {
      return;
    }

    const target = triggerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        void continuePack("auto");
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px 280px 0px",
        threshold: 0.1
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasAttempted, isContinuing, shouldContinue]);

  if (!shouldContinue) {
    return null;
  }

  return (
    <section className="panel reviewContinuationPanel" ref={triggerRef}>
      <StagedTaskStatusBlock
        actionBusyLabel="补全中..."
        actionLabel="立即补全剩余方案"
        eyebrow="补全方案"
        isBusy={isContinuing}
        message={message}
        onAction={() => void continuePack("manual")}
        progressDescription="现在先给你最关键的一条主稿，避免“转为选题”时整包都一起等。继续往下看时，系统会自动补剩余平台方案。"
        progressLabel="当前进度"
        progressValue={`${currentVariantCount} / ${targetVariantCount}`}
        strategyDescription="这样做的目的，是让你先开始判断和审核，不必每次点一下都等完整 4 条内容一起返回。"
        strategyTitle="主稿优先"
        title="先审主稿，剩余变体继续补"
      />
    </section>
  );
}
