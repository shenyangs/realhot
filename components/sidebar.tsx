"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ViewerContext } from "@/lib/auth/types";

interface NavItem {
  href: Route;
  order: string;
  label: string;
  description: string;
  shortLabel: string;
  matchPrefixes?: string[];
}

const baseNavItems: NavItem[] = [
  {
    href: "/",
    order: "01",
    label: "首页",
    shortLabel: "先做什么",
    description: "先看今天卡在哪一步，再决定先处理什么"
  },
  {
    href: "/hotspots",
    order: "02",
    label: "热点机会",
    shortLabel: "找机会",
    description: "先筛机会，再决定哪些值得转成选题包"
  },
  {
    href: "/review",
    order: "03",
    label: "审核台",
    shortLabel: "做判断",
    description: "审核选题方向，判断是否进入内容制作"
  },
  {
    href: "/production-studio",
    order: "04",
    label: "内容制作",
    shortLabel: "做成稿",
    description: "把通过审核的方案做成最终可发布内容"
  },
  {
    href: "/publish",
    order: "05",
    label: "发布中心",
    shortLabel: "去发布",
    description: "安排排期、执行发布并查看结果"
  }
];

const trialNavItems: NavItem[] = baseNavItems.filter((item) => item.href === "/" || item.href === "/hotspots");
const hiddenContextItems: NavItem[] = [
  {
    href: "/brands",
    order: "06",
    label: "品牌底盘",
    shortLabel: "定规则",
    description: "统一品牌定位、表达边界和传播主题"
  }
];

export function Sidebar({ viewer }: { viewer: ViewerContext }) {
  const pathname = usePathname();
  const isTrial = viewer.effectiveRole === "trial_guest";
  const navItems = isTrial
    ? trialNavItems
    : viewer.isPlatformAdmin
      ? [
          ...baseNavItems,
          {
            href: "/admin" as Route,
            order: "06",
            label: "平台后台",
            shortLabel: "管理",
            description: "用户、组织、日志与系统配置",
            matchPrefixes: ["/admin"]
          }
        ]
      : baseNavItems;

  function isItemActive(item: NavItem) {
    if (item.href === "/") {
      return pathname === "/";
    }

    if (pathname === item.href) {
      return true;
    }

    if (item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix))) {
      return true;
    }

    return pathname.startsWith(`${item.href}/`);
  }

  const activeItem = [...navItems, ...hiddenContextItems].find((item) => isItemActive(item)) ?? navItems[0];

  return (
    <aside className="sidebar">
      <div className="sidebarInner">
        <div className="sidebarBrand">
          <Link className="brandLink" href="/">
            品牌内容工作台
          </Link>
          <div className="sidebarBrandMeta">
            <span className="tag">{viewer.currentWorkspace?.name ?? "平台视角"}</span>
            <span className={`tag ${viewer.mode === "demo" ? "" : "tag-live"}`}>
              {viewer.mode === "demo" ? "Demo" : "实时环境"}
            </span>
          </div>
        </div>

        <div className="sidebarSection">
          <span className="sidebarLabel">主流程</span>
          <nav className="nav" aria-label="main navigation">
            {navItems.map((item) => {
              const isActive = isItemActive(item);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`navCard ${isActive ? "navCardActive" : ""}`}
                  href={item.href}
                  key={item.href}
                  title={item.description}
                >
                  <div className="navCardHeader">
                    <span className="navCardMeta">{item.order}</span>
                    <span className="navCardMeta">{item.shortLabel}</span>
                  </div>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebarContextCard">
          <div className="sidebarContextRow">
            <span className="statusDot statusDot-neutral" />
            <span className="sidebarLabel">{activeItem.label}</span>
          </div>
          <div className="sidebarContextMeta">
            <small className="muted">
              {viewer.isPlatformAdmin ? "平台管理员" : isTrial ? "试用访客（只读）" : "业务工作台"}
            </small>
            <small className="muted">{activeItem.description}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
