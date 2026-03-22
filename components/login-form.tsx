"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!enabled || isPending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requiresWorkspaceSelection?: boolean;
      };

      if (!response.ok || !result.ok) {
        setError(result.error ?? "login_failed");
        return;
      }

      router.push(result.requiresWorkspaceSelection ? "/select-workspace" : "/");
      router.refresh();
    });
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="field">
        <span>邮箱</span>
        <input disabled={!enabled || isPending} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" type="email" value={email} />
      </div>
      <div className="field">
        <span>密码</span>
        <input disabled={!enabled || isPending} onChange={(event) => setPassword(event.target.value)} placeholder="输入 Supabase Auth 密码" type="password" value={password} />
      </div>
      <button className="buttonLike primaryButton" disabled={!enabled || isPending} type="submit">
        {isPending ? "登录中..." : "登录"}
      </button>
      {!enabled ? <p className="muted">当前没有检测到完整的 Supabase 登录配置，可先用下方 demo 账号体验。</p> : null}
      {error ? <p className="muted">{error}</p> : null}
    </form>
  );
}
