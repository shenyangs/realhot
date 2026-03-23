"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ViewerContext } from "@/lib/auth/types";

interface MobileNavItem {
  href: Route;
  label: string;
  short: string;
  matchPrefixes?: string[];
}

const workbenchNavItems: MobileNavItem[] = [
  { href: "/", label: "首页", short: "先做什么" },
  { href: "/hotspots", label: "热点", short: "找机会" },
  { href: "/review", label: "审核", short: "做判断" },
  { href: "/production-studio", label: "制作", short: "做成稿" },
  { href: "/publish", label: "发布", short: "去执行" }
];

const adminWorkbenchNavItems: MobileNavItem[] = [
  { href: "/", label: "首页", short: "先做什么" },
  { href: "/hotspots", label: "热点", short: "找机会" },
  { href: "/review", label: "审核", short: "做判断" },
  { href: "/production-studio", label: "制作", short: "做成稿" },
  { href: "/publish", label: "发布", short: "去执行" },
  { href: "/admin", label: "后台", short: "管理", matchPrefixes: ["/admin"] }
];

const adminNavItems: MobileNavItem[] = [
  { href: "/", label: "首页", short: "返回" },
  { href: "/admin", label: "后台", short: "总览", matchPrefixes: ["/admin/vercel-usage"] },
  { href: "/admin/users", label: "用户", short: "账号" },
  { href: "/admin/workspaces", label: "组织", short: "空间" },
  { href: "/admin/ai-routing", label: "路由", short: "模型" },
  { href: "/admin/logs", label: "日志", short: "记录" }
];

export function MobileDock({ viewer }: { viewer: ViewerContext }) {
  const pathname = usePathname();
  const navItems = viewer.isPlatformAdmin && viewer.memberships.length > 0
    ? adminWorkbenchNavItems
    : pathname.startsWith("/admin")
      ? adminNavItems
      : workbenchNavItems;
  const navClassName = `mobileDockNav ${navItems.length > 5 ? "mobileDockNavDense" : ""}`;

  function isItemActive(item: MobileNavItem) {
    if (item.href === "/") {
      return pathname === "/";
    }

    if (item.href === "/admin") {
      if (pathname === "/admin") {
        return true;
      }

      return item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
    }

    if (pathname === item.href) {
      return true;
    }

    if (item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix))) {
      return true;
    }

    return pathname.startsWith(`${item.href}/`);
  }

  return (
    <nav aria-label="mobile navigation" className="mobileDock">
      <div className={navClassName}>
        {navItems.map((item) => {
          const isActive = isItemActive(item);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`mobileDockLink ${isActive ? "mobileDockLinkActive" : ""}`}
              href={item.href}
              key={item.href}
            >
              <strong>{item.label}</strong>
              <small>{item.short}</small>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
