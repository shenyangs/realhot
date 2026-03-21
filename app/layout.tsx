import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "热点驱动内容台",
  description: "面向中国品牌团队的热点判断、选题推进与内容生产工作台。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="appShell">
          <Sidebar
            footer={
              <div className="panel compact">
                <p className="eyebrow">当前范围</p>
                <p className="muted">
                  先把品牌接入、今日选题台和选题编辑体验打顺，再逐步补齐发布与账号机制。
                </p>
              </div>
            }
          />
          <main className="mainContent">{children}</main>
        </div>
      </body>
    </html>
  );
}
