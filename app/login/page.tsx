import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoRoleSwitcher } from "@/components/demo-role-switcher";
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
        <p className="muted">如果已经配置好 Supabase Auth，就用真实账号登录；如果还在本地试用，可以直接切换 demo 角色。</p>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">真实登录</p>
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
              <p className="eyebrow">本地试用</p>
              <h3>切换 demo 角色</h3>
            </div>
          </div>
          <DemoRoleSwitcher accounts={loginMode.demoAccounts} />
          <div className="inlineActions">
            <Link className="buttonLike subtleButton" href="/">
              返回工作台
            </Link>
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
