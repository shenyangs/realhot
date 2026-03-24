"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  codes: string[];
  role: WorkspaceRole;
  workspaceName?: string;
  appUrl?: string;
}) {
  const baseUrl = normalizeAppUrl(input.appUrl);
  const registerUrl = `${baseUrl}/register`;
  const loginUrl = `${baseUrl}/login`;
  const roleName = roleLabels[input.role];
  const workspaceName = input.workspaceName ?? "当前用户组";
  const codeLines = input.codes.map((code, index) => `${index + 1}. ${code}`);

  return [
    "你好，邀请你加入我们的内容协作系统：",
    "",
    `注册网址：${registerUrl}`,
    `登录地址：${loginUrl}`,
    `加入用户组：${workspaceName}`,
    `默认角色：${roleName}`,
    "",
    "本批邀请码如下：",
    ...codeLines,
    "",
    "使用方式：",
    "1. 打开注册网址",
    "2. 从上面任选一个尚未使用的邀请码",
    "3. 设置登录密码并完成注册",
    "4. 注册成功后会自动加入对应用户组"
  ].join("\n");
}

function formatBatchTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function formatGroupStatus(input: Array<{ status: string }>) {
  const counts = new Map<string, number>();

  input.forEach((item) => {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([status, count]) => `${status} ${count} 个`)
    .join(" / ");
}

interface InviteCodeItem {
  id: string;
  code: string;
  role: WorkspaceRole;
  status: string;
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

interface InviteCodeGroup {
  key: string;
  ids: string[];
  codes: string[];
  role: WorkspaceRole;
  createdAt: string;
  maxUses: number;
  totalUsedCount: number;
  totalMaxUses: number;
  items: InviteCodeItem[];
}

export function InviteCodeList({
  codes,
  workspaceId,
  workspaceName,
  appUrl
}: {
  codes: InviteCodeItem[];
  workspaceId: string;
  workspaceName?: string;
  appUrl?: string;
}) {
  const router = useRouter();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const groupedCodes = useMemo<InviteCodeGroup[]>(() => {
    const groups = new Map<string, InviteCodeGroup>();

    for (const code of codes) {
      const key = `${code.createdAt}__${code.role}__${code.maxUses}`;
      const current = groups.get(key);

      if (current) {
        current.ids.push(code.id);
        current.codes.push(code.code);
        current.totalUsedCount += code.usedCount;
        current.totalMaxUses += code.maxUses;
        current.items.push(code);
        continue;
      }

      groups.set(key, {
        key,
        ids: [code.id],
        codes: [code.code],
        role: code.role,
        createdAt: code.createdAt,
        maxUses: code.maxUses,
        totalUsedCount: code.usedCount,
        totalMaxUses: code.maxUses,
        items: [code]
      });
    }

    return Array.from(groups.values()).sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  }, [codes]);

  async function copyInviteScript(group: InviteCodeGroup) {
    try {
      const script = buildInviteCopyScript({
        codes: group.codes,
        role: group.role,
        workspaceName,
        appUrl
      });

      await navigator.clipboard.writeText(script);
      setCopyFeedback(`已复制这批 ${group.codes.length} 个邀请码的话术`);
      setActionMessage(null);
    } catch {
      setCopyFeedback("复制失败，请检查浏览器复制权限后重试");
    }
  }

  function removeInviteCodes(group: InviteCodeGroup) {
    if (!window.confirm(`删除后，这批 ${group.codes.length} 个邀请码都会移除。确定继续吗？`)) {
      return;
    }

    startTransition(async () => {
      setActionMessage(null);
      setCopyFeedback(null);

      const response = await fetch(`/api/admin/workspaces/${workspaceId}/invite-codes`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ids: group.ids
        })
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        removedCount?: number;
      };

      if (!response.ok || !result.ok) {
        setActionMessage(result.error ?? "invite_code_delete_failed");
        return;
      }

      setActionMessage(`已删除 ${result.removedCount ?? group.ids.length} 个邀请码`);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {groupedCodes.map((group) => (
        <article className="panel teamMemberCard" key={group.key}>
          <div className="teamMemberHeader">
            <div>
              <strong>{group.codes.join(" / ")}</strong>
              <p className="muted">
                {roleLabels[group.role]} · 本批 {group.codes.length} 个 · 生成于 {formatBatchTime(group.createdAt)}
              </p>
            </div>
            <div className="inlineActions">
              <button className="buttonLike subtleButton" onClick={() => copyInviteScript(group)} type="button">
                复制整批话术
              </button>
              <button className="dangerButton" disabled={isPending} onClick={() => removeInviteCodes(group)} type="button">
                {isPending ? "删除中..." : "删除这批"}
              </button>
            </div>
          </div>
          <p className="muted">
            总使用 {group.totalUsedCount} / {group.totalMaxUses} · 每个码最多 {group.maxUses} 次 · 状态：{formatGroupStatus(group.items)}
          </p>
        </article>
      ))}
      {copyFeedback ? <p className="muted">{copyFeedback}</p> : null}
      {actionMessage ? <p className="muted">{actionMessage}</p> : null}
    </div>
  );
}
