import type { Metadata, Viewport } from "next";
import { AppTopbar } from "@/components/app-topbar";
import { MobileDock } from "@/components/mobile-dock";
import { getCurrentViewer } from "@/lib/auth/session";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Content OS",
  description: "面向品牌团队的热点判断、选题推进、改稿审核与发布执行工作台。",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
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
            <MobileDock />
          </main>
        </div>
      </body>
    </html>
  );
}
