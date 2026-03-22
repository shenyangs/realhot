"use client";

import { useState, useTransition } from "react";

export function PasswordSettingsForm({
  passwordSetupRequired
}: {
  passwordSetupRequired?: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        if (!nextPassword || nextPassword !== confirmPassword) {
          setMessage("两次输入的新密码不一致");
          return;
        }

        startTransition(async () => {
          const response = await fetch("/api/auth/password", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              currentPassword,
              nextPassword
            })
          });

          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };

          if (!response.ok || !result.ok) {
            setMessage(result.error ?? "password_change_failed");
            return;
          }

          setCurrentPassword("");
          setNextPassword("");
          setConfirmPassword("");
          setMessage(passwordSetupRequired ? "初始密码已设置" : "密码已更新");
        });
      }}
    >
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Security</p>
          <h3>{passwordSetupRequired ? "设置初始密码" : "修改密码"}</h3>
        </div>
      </div>
      <p className="muted">
        {passwordSetupRequired
          ? "首次进入建议立即设置你自己的密码。demo 默认密码是 `Init@123`。"
          : "超级管理员和普通成员都可以在这里更新自己的登录密码。"}
      </p>
      <label className="field fieldCompact">
        <span>当前密码</span>
        <input onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} />
      </label>
      <label className="field fieldCompact">
        <span>新密码</span>
        <input onChange={(event) => setNextPassword(event.target.value)} type="password" value={nextPassword} />
      </label>
      <label className="field fieldCompact">
        <span>确认新密码</span>
        <input onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
      </label>
      <div className="inlineActions">
        <button className="buttonLike primaryButton" disabled={isPending} type="submit">
          {isPending ? "提交中..." : passwordSetupRequired ? "设置密码" : "更新密码"}
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}

