"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

interface MobileNavItem {
  href: Route;
  label: string;
}

const mobileNavItems: MobileNavItem[] = [
  { href: "/", label: "工作台" },
  { href: "/hotspots", label: "热点" },
  { href: "/review", label: "审核" },
  { href: "/publish", label: "发布" },
  { href: "/account", label: "账户" }
];

export function MobileDock() {
  const pathname = usePathname();

  return (
    <nav aria-label="mobile navigation" className="mobileDock">
      <div className="mobileDockNav">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`mobileDockLink ${isActive ? "mobileDockLinkActive" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
