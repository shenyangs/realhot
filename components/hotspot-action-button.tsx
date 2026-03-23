"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface HotspotActionButtonProps {
  hotspotId: string;
  packId?: string;
  variantId?: string;
  platform?: string;
  readOnly?: boolean;
}

function buildReviewHref(input: {
  packId: string;
  variantId?: string;
  platform?: string;
}): Route {
  const params = new URLSearchParams({
    pack: input.packId
  });

  if (input.variantId) {
    params.set("variant", input.variantId);
  }

  if (input.platform) {
    params.set("platform", input.platform);
  }

  return `/review?${params.toString()}` as Route;
}

export function HotspotActionButton({
  hotspotId,
  packId,
  variantId,
  platform,
  readOnly = false
}: HotspotActionButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  if (readOnly) {
    return (
      <button className="buttonLike subtleButton" disabled type="button">
        试用可浏览 · 暂不可转题
      </button>
    );
  }

  if (packId) {
    return (
      <Link
        className="buttonLike primaryButton"
        href={buildReviewHref({
          packId,
          variantId,
          platform
        })}
      >
        查看已转选题
      </Link>
    );
  }

  function generatePack() {
    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/content-packs/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          hotspotId
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            pack?: {
              id: string;
              variants?: Array<{
                id: string;
                platforms?: string[];
              }>;
            };
            usedMockStorage?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok || !payload.pack?.id) {
        setMessage(payload?.error ?? "生成选题包失败");
        return;
      }

      const nextVariant = payload.pack.variants?.[0];
      const nextPlatform = nextVariant?.platforms?.[0];
      const nextHref = buildReviewHref({
        packId: payload.pack.id,
        variantId: nextVariant?.id,
        platform: nextPlatform
      });

      if (payload.usedMockStorage) {
        setMessage("已生成并保存到本地试用数据，正在进入选题库。");
      }

      router.push(nextHref);
      router.refresh();
    });
  }

  return (
    <div className="inlineActionStack">
      <button disabled={isPending} onClick={generatePack} type="button">
        {isPending ? "正在转为选题..." : "转为选题"}
      </button>
      {message ? <p className="muted inlineActionMessage">{message}</p> : null}
    </div>
  );
}
