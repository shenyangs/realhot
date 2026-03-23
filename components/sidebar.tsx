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
    label: "工作台",
    shortLabel: "总控",
    description: "今天最该先处理什么"
  },
  {
    href: "/hotspots",
    order: "02",
    label: "热点看板",
    shortLabel: "热点",
    description: "先筛选，再判断，再转题"
  },
  {
    href: "/review",
    order: "03",
    label: "选题详情台",
    shortLabel: "选题",
    description: "左侧决策，右侧编辑"
  },
  {
    href: "/publish",
    order: "04",
    label: "发布执行台",
    shortLabel: "发布",
    description: "查看运行状态与失败诊断"
  },
  {
    href: "/production-studio",
    order: "05",
    label: "内容深度制作",
    shortLabel: "制作",
    description: "一键生成后统一微调"
  },
  {
    href: "/brands",
    order: "06",
    label: "品牌系统",
    shortLabel: "品牌",
    description: "统一定位、语调边界与传播主题"
  }
];

export function Sidebar({ viewer }: { viewer: ViewerContext }) {
  const pathname = usePathname();
  const navItems = viewer.isPlatformAdmin
    ? [
        ...baseNavItems,
        {
          href: "/admin" as Route,
          order: "07",
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

  const activeItem = navItems.find((item) => isItemActive(item)) ?? navItems[0];

  return (
    <aside className="sidebar">
      <div className="sidebarInner">
        <div className="sidebarBrand">
          <span className="sidebarKicker">内容工作台</span>
          <Link className="brandLink" href="/">
            热点驱动内容台
          </Link>
          <p className="muted">
            从热点信号到内容发布，把判断、编辑、审核和执行收进同一套品牌操作系统。
          </p>
          <div className="sidebarBrandMeta">
            <span className="tag">运行中</span>
            <span className="tag">{viewer.mode === "demo" ? "Demo 数据" : "实时环境"}</span>
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

        <div className="sidebarStatusCard">
          <div className="statusCardLabelRow">
            <span className="statusDot" />
            <span className="sidebarLabel">当前位置</span>
          </div>
          <strong>{activeItem.label}</strong>
          <p className="muted">{activeItem.description}</p>
          <div className="sidebarStatusMeta">
            {viewer.currentWorkspace ? <small className="muted">工作区：{viewer.currentWorkspace.name}</small> : null}
            <small className="muted">当前角色：{viewer.isPlatformAdmin ? "平台管理员" : "业务工作台"}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
