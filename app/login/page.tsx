import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getLoginMode } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export default async function LoginPage() {
  const viewer = await getCurrentViewer();
  const loginMode = await getLoginMode();

  if (viewer.isAuthenticated && viewer.memberships.length > 1 && !viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

  if (viewer.isAuthenticated && viewer.currentWorkspace) {
    redirect("/");
  }

  if (viewer.isPlatformAdmin) {
    redirect("/admin");
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
        <p className="muted">使用已开通账号登录工作台，新成员可通过邀请码完成注册。</p>
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
              <h3>{loginMode.supportsSupabaseLogin ? "账号开通" : "超级管理员入口"}</h3>
            </div>
          </div>
          <div className="stack">
            {loginMode.supportsSupabaseLogin ? (
              <>
                <p className="muted">使用已开通账号登录。新成员可通过邀请码注册加入。</p>
                <p className="muted">如需开通账号或加入组织，请联系平台管理员。</p>
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
        <p className="muted">不同账号的可见范围和操作权限由管理员统一配置。</p>
      </section>
    </div>
  );
}
