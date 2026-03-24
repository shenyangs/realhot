import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { listPlatformAuditLogs } from "@/lib/auth/audit";
import { listPlatformUsers, listPlatformWorkspaces } from "@/lib/auth/repository";
import { formatAuditPayloadForDisplay } from "@/lib/shared/display-format";

const actionLabels: Record<string, string> = {
  "auth.login_success": "登录成功",
  "auth.login_failed": "登录失败",
  "auth.logout": "退出登录",
  "auth.password_changed": "修改密码",
  "auth.workspace_switched": "切换工作组",
  "auth.registered_with_invite_code": "邀请码注册",
  "auth.pending_invite_accepted": "接受待处理邀请",
  "admin.user_created": "创建账号",
  "admin.user_status_changed": "修改账号状态",
  "workspace.member_updated": "修改成员角色/状态",
  "workspace.invite_created": "创建成员邀请",
  "workspace.invite_codes_created": "生成邀请码",
  "workspace.invite_codes_deleted": "删除邀请码",
  "workspace.created": "创建组织",
  "workspace.updated": "修改工作组",
  "platform.ai_routing_updated": "修改模型路由",
  "platform.ai_provider_connection_tested": "测试模型连通性",
  "hotspot.insight_generated": "生成热点深挖",
  "content.pack_generated": "生成内容包",
  "content.pack_exported": "导出内容包",
  "review.status_updated": "提交审核结果",
  "review.pack_deleted": "删除选题包",
  "publish.jobs_queued": "加入发布队列",
  "publish.queue_cleared": "清空发布队列",
  "publish.job_deleted": "删除发布任务",
  "publish.queue_run_completed": "执行发布队列",
  "production.one_click_generated": "一键制作内容",
  "production.draft_updated": "修改制作稿",
  "production.bundle_pushed": "推入发布队列",
  "review.pack_viewed": "查看审核详情",
  "production.pack_viewed": "查看制作详情"
};

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(parsed);
}

export default async function AdminLogsPage({
  searchParams
}: {
  searchParams?: Promise<{
    actor?: string;
    workspace?: string;
    action?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const [logs, users, workspaces] = await Promise.all([
    listPlatformAuditLogs({
      actorUserId: params.actor || undefined,
      workspaceId: params.workspace || undefined,
      action: params.action || undefined,
      limit: 200
    }),
    listPlatformUsers(),
    listPlatformWorkspaces()
  ]);
  const visibleActions = Array.from(new Set(logs.map((log) => log.action))).length;

  return (
    <div className="page adminConsolePage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#log-filters">
              筛选日志
            </Link>
            <Link className="buttonLike subtleButton" href="/admin">
              返回后台总览
            </Link>
          </>
        }
        description="日志页不是原始流水，而是平台层运行记录。优先帮助你快速定位谁做了什么、在哪个组织、留下了什么影响。"
        eyebrow="Admin / Logs"
        facts={[
          { label: "当前结果", value: `${logs.length} 条` },
          { label: "涉及用户", value: `${users.length} 个` },
          { label: "涉及组织", value: `${workspaces.length} 个` },
          { label: "动作类型", value: `${visibleActions} 类` }
        ]}
        title="全平台操作日志"
      />

      <form className="panel stack" id="log-filters" method="get">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Filters</p>
            <h3>筛选条件</h3>
          </div>
          <span className="muted">按用户、组织、动作快速收窄范围</span>
        </div>
        <div className="teamInviteGrid">
          <label className="field fieldCompact">
            <span>用户</span>
            <select defaultValue={params.actor ?? ""} name="actor">
              <option value="">全部用户</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field fieldCompact">
            <span>工作组</span>
            <select defaultValue={params.workspace ?? ""} name="workspace">
              <option value="">全部工作组</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field fieldCompact">
            <span>动作</span>
            <input defaultValue={params.action ?? ""} name="action" placeholder="例如 login / invite / publish" />
          </label>
        </div>
        <div className="inlineActions">
          <button className="buttonLike primaryButton" type="submit">
            应用筛选
          </button>
          <Link className="buttonLike subtleButton" href="/admin/logs">
            清空筛选
          </Link>
        </div>
      </form>

      <section className="adminEntityList">
        {logs.length === 0 ? (
          <article className="panel systemFeedbackCard">
            <strong>当前没有匹配到日志记录</strong>
            <p className="muted">建议下一步：放宽筛选条件，或者回到平台后台查看最近是否有新的系统动作。</p>
          </article>
        ) : (
          logs.map((log) => {
            const payloadDisplay = formatAuditPayloadForDisplay(log.payload);

            return (
              <article className="panel adminEntityCard" key={log.id}>
                <div className="adminEntityHead">
                  <div>
                    <strong>{actionLabels[log.action] ?? log.action}</strong>
                    <p className="muted">{formatDate(log.createdAt)}</p>
                  </div>
                  <span className="pill pill-neutral">{log.entityType}</span>
                </div>

                <div className="adminMetricGrid">
                  <div>
                    <span>操作人</span>
                    <strong>
                      {log.actorDisplayName}
                      {log.actorEmail ? ` · ${log.actorEmail}` : ""}
                    </strong>
                  </div>
                  <div>
                    <span>工作组</span>
                    <strong>{log.workspaceName ?? "平台级动作"}</strong>
                  </div>
                </div>

                {payloadDisplay.sections.length > 0 ? (
                  <div className="adminPayloadSections">
                    {payloadDisplay.sections.map((section) => (
                      <section className="subPanel adminPayloadSection" key={`${log.id}-${section.title}`}>
                        <strong>{section.title}</strong>
                        <ul className="simpleList adminPayloadList">
                          {section.items.map((item) => (
                            <li key={`${section.title}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                    {payloadDisplay.hiddenCount > 0 ? (
                      <p className="muted">已隐藏 {payloadDisplay.hiddenCount} 条设备与请求上下文字段，避免干扰排查。</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">详情：无附加信息</p>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
