"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "/hotspots",
    label: "热点看板",
    description: "查看全部抓取热点、信源和处理建议"
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

export function Sidebar() {
  const pathname = usePathname();
  const activeItem = navItems.find((item) => pathname === item.href) ?? navItems[0];

  return (
    <header className="sidebar">
      <div className="sidebarTop">
        <div className="brandBlock">
          <Link className="brandLink" href="/">
            热点驱动内容台
          </Link>
          <p className="muted">热点 - 选题 - 改稿 - 发布，一条线走完，不让人迷路。</p>
        </div>

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
              </Link>
            );
          })}
        </nav>

        <div className="statusCard">
          <span className="statusDot" />
          <div>
            <strong>{activeItem.label}</strong>
            <p className="muted">{activeItem.description}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
