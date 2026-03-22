import type { Metadata } from "next";
import { AppTopbar } from "@/components/app-topbar";
import { getCurrentViewer } from "@/lib/auth/session";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Content OS",
  description: "面向品牌团队的热点判断、选题推进、改稿审核与发布执行工作台。"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getCurrentViewer();

  return (
    <html lang="zh-CN">
      <body>
        <div className="appShell">
          <Sidebar viewer={viewer} />
          <main className="mainContent">
            <AppTopbar viewer={viewer} />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
