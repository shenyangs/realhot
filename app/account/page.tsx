import { redirect } from "next/navigation";
import { PasswordSettingsForm } from "@/components/password-settings-form";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { canManageMembers } from "@/lib/auth";
import { getCurrentViewer } from "@/lib/auth/session";

const roleExplainMap = {
  super_admin: {
    title: "超级管理员",
    body: "负责整个平台：用户、组织、邀请码、系统配置、问题排查与数据收口。"
  },
  org_admin: {
    title: "组织管理员",
    body: "负责自己组织的成员、品牌资料、工作区设置、邀请码和协作秩序。"
  },
  operator: {
    title: "内容操盘手",
    body: "负责热点发现、传播策划、内容生成、改稿和提审，是日常生产主力。"
  },
  approver: {
    title: "审核者",
    body: "负责审核通过/退回、风险把关和是否允许导出或进入发布。"
  },
  guest: {
    title: "未登录",
    body: "当前未进入工作区，请先登录或注册。"
  }
} as const;

export default async function AccountPage() {
  const viewer = await getCurrentViewer();

  if (!viewer.isAuthenticated) {
    redirect("/login");
  }

  const canManageWorkspace = canManageMembers(viewer);
  const roleExplain = roleExplainMap[viewer.effectiveRole];

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Account Center</p>
            <h1>账号中心</h1>
          </div>
          <span className="pill pill-positive">{roleExplain.title}</span>
        </div>
        <p className="muted">{roleExplain.body}</p>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">个人资料</p>
              <h3>{viewer.user.displayName}</h3>
            </div>
          </div>
          <div className="definitionList">
            <div>
              <span>邮箱</span>
              <strong>{viewer.user.email ?? "未绑定邮箱"}</strong>
            </div>
            <div>
              <span>身份</span>
              <strong>{roleExplain.title}</strong>
            </div>
            <div>
              <span>当前组织</span>
              <strong>{viewer.currentWorkspace?.name ?? "平台后台模式"}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">权限说明</p>
              <h3>你现在能做什么</h3>
            </div>
          </div>
          <div className="definitionList">
            <div>
              <span>热点与策划</span>
              <strong>
                {viewer.effectiveRole === "approver"
                  ? "可查看与审核"
                  : viewer.effectiveRole === "super_admin"
                    ? "可全局查看"
                    : "可查看并参与执行"}
              </strong>
            </div>
            <div>
              <span>成员与组织</span>
              <strong>{canManageWorkspace || viewer.isPlatformAdmin ? "可管理" : "只读查看"}</strong>
            </div>
            <div>
              <span>系统级操作</span>
              <strong>{viewer.isPlatformAdmin ? "可访问平台后台" : "无平台级权限"}</strong>
            </div>
          </div>
        </article>
      </section>

      <PasswordSettingsForm passwordSetupRequired={viewer.user.passwordSetupRequired} />

      {viewer.currentWorkspace && canManageWorkspace ? (
        <WorkspaceSettingsForm canManage workspace={viewer.currentWorkspace} />
      ) : null}
    </div>
  );
}

