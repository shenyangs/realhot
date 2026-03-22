"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { roleLabels, type ViewerContext } from "@/lib/auth/types";

const roleDescriptions = {
  super_admin: "管理全平台用户、组织、邀请码、系统配置和异常处理。",
  org_admin: "管理当前组织的成员、品牌、资料、邀请码与工作区设置。",
  operator: "负责热点捕捉、策划生成、内容编辑和提交审核。",
  approver: "负责审核内容、退回修改、控制是否允许导出与发布。",
  guest: "尚未登录，仅能看到登录与注册入口。"
} as const;

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function ProfileMenu({ viewer }: { viewer: ViewerContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const workspaces = viewer.memberships.map((membership) => membership.workspace);
  const role = viewer.effectiveRole;

  return (
    <div className="profileMenuRoot">
      <button
        className="profileTrigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="profileAvatar">{getInitials(viewer.user.displayName || "U")}</span>
        <span className="profileIdentity">
          <strong>{viewer.user.displayName}</strong>
          <small>{roleLabels[role]}</small>
        </span>
      </button>

      {open ? (
        <div className="profilePanel">
          <div className="profilePanelHeader">
            <span className="profileAvatar profileAvatarLarge">{getInitials(viewer.user.displayName || "U")}</span>
            <div>
              <strong>{viewer.user.displayName}</strong>
              <p className="muted">{viewer.user.email ?? "未绑定邮箱"}</p>
              <p className="muted">{roleDescriptions[role]}</p>
            </div>
          </div>

          {!viewer.isPlatformAdmin && viewer.memberships.length > 0 ? (
            <WorkspaceSwitcher currentSlug={viewer.currentWorkspace?.slug} workspaces={workspaces} />
          ) : null}

          <div className="profileMenuLinks">
            <Link href="/account" onClick={() => setOpen(false)}>
              账号中心
            </Link>
            {!viewer.isPlatformAdmin ? (
              <Link href="/team" onClick={() => setOpen(false)}>
                成员与组织
              </Link>
            ) : null}
            {viewer.isPlatformAdmin ? (
              <>
                <Link href="/admin" onClick={() => setOpen(false)}>
                  平台后台
                </Link>
                <Link href="/admin/workspaces" onClick={() => setOpen(false)}>
                  组织与邀请码
                </Link>
              </>
            ) : null}
          </div>

          <div className="inlineActions">
            {viewer.isAuthenticated ? (
              <button
                className="buttonLike subtleButton"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                    router.refresh();
                  });
                }}
                type="button"
              >
                退出登录
              </button>
            ) : (
              <Link className="buttonLike subtleButton" href="/login" onClick={() => setOpen(false)}>
                去登录
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

