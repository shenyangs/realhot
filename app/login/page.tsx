import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getLoginMode } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

const roleNotes = [
  {
    title: "超级管理员",
    description: "负责平台级配置、组织管理、邀请码生成、用户状态控制与异常处理。"
  },
  {
    title: "组织管理员",
    description: "负责自己组织的成员、品牌、工作区设置、邀请码和日常协作规则。"
  },
  {
    title: "内容操盘手",
    description: "负责热点捕捉、传播策划、内容生成、改稿与提审，是生产主力。"
  },
  {
    title: "审核者",
    description: "负责内容审核、退回意见、风险把关，以及是否允许导出和发布。"
  }
];

export default async function LoginPage() {
  const viewer = await getCurrentViewer();
  const loginMode = await getLoginMode();

  if (viewer.isPlatformAdmin) {
    redirect("/admin");
  }

  if (viewer.isAuthenticated && viewer.memberships.length > 1 && !viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

  if (viewer.isAuthenticated && viewer.currentWorkspace) {
    redirect("/");
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Auth</p>
            <h1>账号登录</h1>
          </div>
        </div>
        <p className="muted">工作台已切换为正式登录入口。未登录不能进入工作台；新成员需要先拿超级管理员生成的邀请码注册。</p>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Sign In</p>
              <h3>账号登录</h3>
            </div>
          </div>
          <LoginForm enabled />
          {loginMode.missingEnv.length > 0 ? (
            <p className="muted">当前未接 Supabase，将先走本地账号登录。缺少环境变量：{loginMode.missingEnv.join(" / ")}</p>
          ) : null}
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{loginMode.supportsSupabaseLogin ? "Access" : "Admin"}</p>
              <h3>{loginMode.supportsSupabaseLogin ? "账号开通说明" : "超级管理员入口"}</h3>
            </div>
          </div>
          <div className="stack">
            {loginMode.supportsSupabaseLogin ? (
              <>
                <p className="muted">当前环境已经切到 Supabase 正式账号体系，不再展示本地 demo / 默认管理员账号。</p>
                <p className="muted">超级管理员通过平台后台管理用户、工作组和邀请码；新成员请使用正式账号登录或通过邀请码注册。</p>
                <p className="muted">如果你还没有账号，请联系平台超级管理员开通。</p>
              </>
            ) : (
              <>
                <p className="muted">当前还未接通 Supabase，本地默认超级管理员账号已固定为：</p>
                <p className="muted">账号：<code>admin</code></p>
                <p className="muted">密码：<code>qingman0525</code></p>
                <p className="muted">登录后可手动添加账号、指定用户组，并生成绑定用户组的邀请码。</p>
              </>
            )}
          </div>
          <div className="inlineActions">
            <Link className="buttonLike subtleButton" href="/register">
              邀码注册
            </Link>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">角色说明</p>
            <h2>不同身份看到的权限和职责</h2>
          </div>
        </div>
        <div className="onboardingGrid">
          {roleNotes.map((item) => (
            <article className="onboardingCard" key={item.title}>
              <strong>{item.title}</strong>
              <p className="muted">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
