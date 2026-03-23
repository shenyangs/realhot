"use client";

import { useState } from "react";
import { roleLabels, WorkspaceRole } from "@/lib/auth/types";

function normalizeAppUrl(appUrl?: string): string {
  const baseUrl =
    appUrl?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "http://localhost:3000";

  return baseUrl.replace(/\/+$/, "");
}

function buildInviteCopyScript(input: {
  code: string;
  role: WorkspaceRole;
  workspaceName?: string;
  appUrl?: string;
}) {
  const baseUrl = normalizeAppUrl(input.appUrl);
  const registerUrl = `${baseUrl}/register`;
  const loginUrl = `${baseUrl}/login`;
  const roleName = roleLabels[input.role];
  const workspaceName = input.workspaceName ?? "当前用户组";

  return [
    "你好，邀请你加入我们的内容协作系统：",
    "",
    `1. 打开注册网址：${registerUrl}`,
    `2. 输入邀请码：${input.code}`,
    "3. 设置登录密码并完成注册",
    `4. 注册后会自动加入【${workspaceName}】并分配角色【${roleName}】`,
    `5. 后续可直接从 ${loginUrl} 登录使用`,
    "",
    "首次使用建议：",
    "1) 先进入选题工作台查看今日任务",
    "2) 使用“一键制作图文+视频”生成初稿",
    "3) 在工作台完成改稿并提交审核/发布"
  ].join("\n");
}

export function InviteCodeList({
  codes,
  workspaceName,
  appUrl
}: {
  codes: Array<{
    id: string;
    code: string;
    role: WorkspaceRole;
    status: string;
    maxUses: number;
    usedCount: number;
  }>;
  workspaceName?: string;
  appUrl?: string;
}) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function copyInviteScript(code: { id: string; code: string; role: WorkspaceRole }) {
    try {
      const script = buildInviteCopyScript({
        code: code.code,
        role: code.role,
        workspaceName,
        appUrl
      });

      await navigator.clipboard.writeText(script);
      setCopyFeedback(`已复制邀请码 ${code.code} 的邀请话术`);
    } catch {
      setCopyFeedback("复制失败，请检查浏览器复制权限后重试");
    }
  }

  return (
    <div className="stack">
      {codes.map((code) => (
        <article className="panel teamMemberCard" key={code.id}>
          <div className="teamMemberHeader">
            <div>
              <strong>{code.code}</strong>
              <p className="muted">{roleLabels[code.role]}</p>
            </div>
            <div className="inlineActions">
              <button className="buttonLike subtleButton" onClick={() => copyInviteScript(code)} type="button">
                复制邀请话术
              </button>
              <span className="pill">{code.status}</span>
            </div>
          </div>
          <p className="muted">
            已使用 {code.usedCount} / {code.maxUses}
          </p>
        </article>
      ))}
      {copyFeedback ? <p className="muted">{copyFeedback}</p> : null}
    </div>
  );
}
