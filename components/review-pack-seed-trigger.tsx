"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StagedTaskStatusBlock } from "@/components/staged-task-status-block";

function getAttemptStorageKey(packId: string) {
  return `review-pack-seed:${packId}`;
}

function getContinuationStorageKey(packId: string) {
  return `review-pack-continue:${packId}`;
}

export function ReviewPackSeedTrigger({
  packId,
  shouldHydrate
}: {
  packId: string;
  shouldHydrate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("");
  const [isHydrating, setIsHydrating] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldHydrate) {
      setHasAttempted(true);
      return;
    }

    const attempted = window.sessionStorage.getItem(getAttemptStorageKey(packId));
    setHasAttempted(Boolean(attempted));
  }, [packId, shouldHydrate]);

  async function hydrateSeed(trigger: "auto" | "manual") {
    if (!shouldHydrate || isHydrating) {
      return;
    }

    try {
      setIsHydrating(true);
      setHasAttempted(true);
      window.sessionStorage.setItem(getAttemptStorageKey(packId), "1");
      setMessage(
        trigger === "auto"
          ? "已开始补正式主稿与完整方案，稍后会自动刷新当前审核页。"
          : "正在补正式主稿与完整方案，请稍等。"
      );

      const response = await fetch(`/api/content-packs/${packId}/continue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          replaceExistingVariants: true
        })
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
        setMessage(payload?.error ?? "补正式主稿失败，请手动重试。");
        return;
      }

      window.sessionStorage.setItem(getContinuationStorageKey(packId), "1");

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("seed");
      const nextHref = (nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname) as Route;

      setMessage("已补成正式主稿，当前审核页会刷新为完整版本。");
      router.replace(nextHref);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补正式主稿失败，请稍后重试。");
    } finally {
      setIsHydrating(false);
    }
  }

  useEffect(() => {
    if (!shouldHydrate || hasAttempted || isHydrating || !triggerRef.current) {
      return;
    }

    const target = triggerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        void hydrateSeed("auto");
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px 280px 0px",
        threshold: 0.1
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasAttempted, isHydrating, shouldHydrate]);

  if (!shouldHydrate) {
    return null;
  }

  return (
    <section className="panel reviewContinuationPanel" ref={triggerRef}>
      <StagedTaskStatusBlock
        actionBusyLabel="补全中..."
        actionLabel="立即补正式主稿"
        eyebrow="主稿升级"
        isBusy={isHydrating}
        message={message}
        onAction={() => void hydrateSeed("manual")}
        progressDescription="你已经先进入审核页了，系统现在会把模板首稿替换成正式主稿，并继续补完整方案。"
        progressLabel="当前进度"
        progressValue="模板首稿 -> 正式主稿"
        strategyDescription="先让你进入审核页，不再卡在转题按钮上；等正式主稿回来后，再继续补其它平台方案。"
        strategyTitle="秒进页，再补正稿"
        title="先进入审核，再补正式主稿"
      />
    </section>
  );
}
