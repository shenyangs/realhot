"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function AccountActions({ isSupabaseSession }: { isSupabaseSession: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="inlineActions">
      <Link className="buttonLike subtleButton" href="/login">
        {isSupabaseSession ? "账号设置" : "切换账号"}
      </Link>
      {isSupabaseSession ? (
        <button
          className="buttonLike subtleButton"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await fetch("/api/auth/logout", {
                method: "POST"
              });
              router.push("/login");
              router.refresh();
            });
          }}
          type="button"
        >
          退出登录
        </button>
      ) : null}
    </div>
  );
}
