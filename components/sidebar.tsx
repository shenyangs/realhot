"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ViewerContext } from "@/lib/auth/types";

interface NavItem {
  href: Route;
  label: string;
  description: string;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "工作台",
    description: "先看今天有哪些热点、任务和卡点"
  },
  {
    href: "/hotspots",
    label: "热点看板",
    description: "看全部热点，再挑值得跟进的题"
  },
  {
    href: "/review",
    label: "选题详情台",
    description: "集中改稿、审核，也能直接删除选题"
  },
  {
    href: "/publish",
    label: "发布执行台",
    description: "排队发布、清空待执行、查看结果"
  },
  {
    href: "/brands",
    label: "品牌系统",
    description: "维护品牌语境、规则和素材资产"
  }
];

export function Sidebar({ viewer }: { viewer: ViewerContext }) {
  const pathname = usePathname();
  const activeItem = navItems.find((item) => pathname === item.href) ?? navItems[0];

  return (
    <aside className="sidebar">
      <div className="sidebarInner">
        <div className="sidebarBrand">
          <span className="sidebarKicker">内容工作台</span>
          <Link className="brandLink" href="/">
            热点驱动内容台
          </Link>
          <p className="muted">
            从热点信号到内容发布，用一套安静、清晰、可执行的品牌工作流跑完。
          </p>
        </div>

        <div className="sidebarSection">
          <span className="sidebarLabel">主流程</span>
          <nav className="nav" aria-label="main navigation">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`navCard ${isActive ? "navCardActive" : ""}`}
                  href={item.href}
                  key={item.href}
                  title={item.description}
                >
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
          {viewer.currentWorkspace ? <small className="muted">{viewer.currentWorkspace.name}</small> : null}
        </div>
      </div>
    </aside>
  );
}
