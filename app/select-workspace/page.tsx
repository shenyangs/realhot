import { redirect } from "next/navigation";
import { WorkspaceSelectionList } from "@/components/workspace-selection-list";
import { listAvailableWorkspaces } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export default async function SelectWorkspacePage() {
  const viewer = await getCurrentViewer();
  const workspaces = await listAvailableWorkspaces();

  if (viewer.isPlatformAdmin) {
    redirect("/admin");
  }

  if (!viewer.isAuthenticated) {
    redirect("/login");
  }

  if (workspaces.length === 1) {
    redirect("/");
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>选择工作区</h1>
          </div>
        </div>
        <p className="muted">你的账号已加入多个工作区。先选一个当前工作区，再进入内容工作台。</p>
      </section>

      <WorkspaceSelectionList workspaces={workspaces} />
    </div>
  );
}
