import type { Metadata, Viewport } from "next";
import { AppTopbar } from "@/components/app-topbar";
import { ClientRequestContextBootstrap } from "@/components/client-request-context-bootstrap";
import { MobileDock } from "@/components/mobile-dock";
import { listAvailableWorkspaces } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "热点运营平台",
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
  const availableWorkspaces = viewer.isAuthenticated ? await listAvailableWorkspaces() : [];
  const viewerWithWorkspaces = {
    ...viewer,
    availableWorkspaces
  };

  return (
    <html lang="zh-CN">
      <body>
        <ClientRequestContextBootstrap />
        <div className="appShell">
          <Sidebar viewer={viewerWithWorkspaces} />
          <main className="mainContent">
            <AppTopbar viewer={viewerWithWorkspaces} />
            {children}
            <MobileDock viewer={viewerWithWorkspaces} />
          </main>
        </div>
      </body>
    </html>
  );
}
