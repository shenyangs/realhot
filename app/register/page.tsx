import Link from "next/link";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Register</p>
            <h1>邀请码注册</h1>
          </div>
        </div>
        <p className="muted">只有拿到超级管理员为组织生成的邀请码，才能注册进入对应工作区。</p>
      </section>
      <RegisterForm />
      <div className="inlineActions">
        <Link className="buttonLike subtleButton" href="/login">
          返回登录
        </Link>
      </div>
    </div>
  );
}
