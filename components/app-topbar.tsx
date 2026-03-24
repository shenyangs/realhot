"use client";

import { usePathname } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ViewerContext } from "@/lib/auth/types";

const routeMeta = [
  {
    href: "/",
    eyebrow: "Today",
    title: "今天先做什么",
    description: "先看当前卡在哪一步，再决定今天先处理什么"
  },
  {
    href: "/hotspots",
    eyebrow: "Opportunity Board",
    title: "热点机会",
    description: "先筛机会，再决定哪些值得转成选题包"
  },
  {
    href: "/review",
    eyebrow: "Review Desk",
    title: "审核台",
    description: "审核选题方向，判断是否进入内容制作"
  },
  {
    href: "/publish",
    eyebrow: "Publish Center",
    title: "发布中心",
    description: "安排排期、执行发布并查看结果"
  },
  {
    href: "/production-studio",
    eyebrow: "Production",
    title: "内容制作",
    description: "把通过审核的方案做成最终可发布内容"
  },
  {
    href: "/brands",
    eyebrow: "Brand Foundation",
    title: "品牌底盘",
    description: "统一品牌规则、表达边界和传播主题"
  },
  {
    href: "/admin",
    eyebrow: "Platform Admin",
    title: "平台后台",
    description: "用户、组织与系统配置"
  }
] as const;

export function AppTopbar({ viewer }: { viewer: ViewerContext }) {
  const pathname = usePathname();
  const active =
    routeMeta.find((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))) ??
    routeMeta[0];

  return (
    <header className="topbar topbarRefined">
      <div className="topbarLead">
        <div>
          <p className="eyebrow">{active.eyebrow}</p>
          <h2 className="topbarTitle">{active.title}</h2>
        </div>
        <p className="topbarSubtitle">{active.description}</p>
      </div>

      <div className="topbarMetaStrip">
        {viewer.isPlatformAdmin && (viewer.availableWorkspaces?.length ?? 0) > 0 ? (
          <div className="topbarMetaCard topbarWorkspaceSwitcher">
            <WorkspaceSwitcher
              currentSlug={viewer.currentWorkspace?.slug}
              label="切换组织"
              workspaces={viewer.availableWorkspaces ?? []}
            />
          </div>
        ) : null}
        <div className="topbarMetaCard">
          <span>当前空间</span>
          <strong>{viewer.currentWorkspace?.name ?? "平台视角"}</strong>
        </div>
        <div className="topbarMetaCard">
          <span>系统状态</span>
          <strong>{viewer.mode === "demo" ? "Demo 运行" : "实时运行"}</strong>
        </div>
        <ProfileMenu viewer={viewer} />
      </div>
    </header>
  );
}
