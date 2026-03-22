"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              code,
              displayName,
              email,
              password
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "registration_failed");
            return;
          }

          router.push("/select-workspace");
          router.refresh();
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Register</p>
          <h3>邀请码注册</h3>
        </div>
      </div>
      <p className="muted">注册必须填写邀请码。初始进入时就在这里设置你的登录密码。</p>
      <label className="field fieldCompact">
        <span>邀请码</span>
        <input onChange={(event) => setCode(event.target.value)} value={code} />
      </label>
      <label className="field fieldCompact">
        <span>姓名</span>
        <input onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
      </label>
      <label className="field fieldCompact">
        <span>邮箱</span>
        <input onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
      </label>
      <label className="field fieldCompact">
        <span>设置密码</span>
        <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
      </label>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "注册中..." : "注册并进入"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}

