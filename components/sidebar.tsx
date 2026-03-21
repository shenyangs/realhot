"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface NavItem {
  href: Route;
  label: string;
  description: string;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "今日选题台",
    description: "先判断今天该做什么，再推进选题生产"
  },
  {
    href: "/review",
    label: "选题库",
    description: "查看选题、进入编辑、提交审核"
  },
  {
    href: "/publish",
    label: "发布台",
    description: "统一查看待发布、队列状态和发布结果"
  },
  {
    href: "/brands",
    label: "品牌与规则",
    description: "维护品牌画像、素材、规则和近期动态"
  }
];

export function Sidebar({ footer }: { footer?: ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebarTop">
        <div className="brandBlock">
          <p className="eyebrow">SignalStack</p>
          <h1>热点驱动内容台</h1>
          <p className="muted">
            面向中国企业品牌团队的热点判断、选题推进与多平台内容生产工作台。
          </p>
        </div>

        <div className="statusCard">
          <span className="statusDot" />
          <div>
            <strong>今天的工作重心</strong>
            <p className="muted">先判断值得做的题，再清待审核和待发布出口。</p>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`navCard ${isActive ? "navCardActive" : ""}`}
                href={item.href}
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {footer}
    </aside>
  );
}
