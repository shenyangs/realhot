"use client";

import { usePathname } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { ViewerContext } from "@/lib/auth/types";

const routeMeta = [
  {
    href: "/",
    eyebrow: "Command Center",
    title: "内容工作台",
    description: "今天的优先处理顺序"
  },
  {
    href: "/hotspots",
    eyebrow: "Decision Board",
    title: "热点看板",
    description: "筛选、判断、转题"
  },
  {
    href: "/review",
    eyebrow: "Topic Review",
    title: "选题详情台",
    description: "左决策，右编辑"
  },
  {
    href: "/publish",
    eyebrow: "Release Console",
    title: "发布执行台",
    description: "运行状态与异常处理"
  },
  {
    href: "/production-studio",
    eyebrow: "Production",
    title: "内容深度制作",
    description: "生成后的统一微调"
  },
  {
    href: "/brands",
    eyebrow: "Brand Brain",
    title: "品牌系统",
    description: "品牌认知与表达规则"
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
