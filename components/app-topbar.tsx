import { ProfileMenu } from "@/components/profile-menu";
import { ViewerContext } from "@/lib/auth/types";

export function AppTopbar({ viewer }: { viewer: ViewerContext }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Brand Content OS</p>
        <h2 className="topbarTitle">内容工作台</h2>
      </div>
      <ProfileMenu viewer={viewer} />
    </header>
  );
}

