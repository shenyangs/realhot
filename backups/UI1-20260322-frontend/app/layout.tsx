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
          <Sidebar />
          <main className="mainContent">{children}</main>
        </div>
      </body>
    </html>
  );
}
