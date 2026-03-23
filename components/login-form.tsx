"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [identifier, setIdentifier] = useState("");
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
          identifier,
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
        <span>账号 / 邮箱</span>
        <input
          disabled={!enabled || isPending}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="输入账号或邮箱"
          type="text"
          value={identifier}
        />
      </div>
      <div className="field">
        <span>密码</span>
        <input disabled={!enabled || isPending} onChange={(event) => setPassword(event.target.value)} placeholder="输入登录密码" type="password" value={password} />
      </div>
      <button className="buttonLike primaryButton" disabled={!enabled || isPending} type="submit">
        {isPending ? "登录中..." : "登录"}
      </button>
      {!enabled ? <p className="muted">当前没有检测到完整的 Supabase 配置，将使用本地账号体系。</p> : null}
      {error ? <p className="muted">{error}</p> : null}
    </form>
  );
}
