import Link from "next/link";
import { BrandOnboardingStatus } from "@/components/brand-onboarding-status";
import { BrandOnboardingWizard } from "@/components/brand-onboarding-wizard";
import { getBrandStrategyPack } from "@/lib/data";

export default async function OnboardingPage() {
  const brand = await getBrandStrategyPack();

  return (
    <div className="page onboardingPage">
      <section className="onboardingHero panel">
        <div>
          <p className="eyebrow">首次接入</p>
          <h2>先把品牌接进来，再让系统开始替你判断热点和组织内容。</h2>
          <p className="muted heroText">
            这是第一次进入系统时最该走的一步。你讲得越清楚，后面的热点判断、选题转换、内容改稿就越不像模板，越像你的团队。
          </p>
        </div>
        <div className="buttonRow">
          <Link className="buttonLike subtleButton" href="/brands">
            直接查看品牌与规则
          </Link>
          <Link className="buttonLike" href="/">
            跳到今日选题台
          </Link>
        </div>
      </section>

      <section className="summaryGrid">
        <BrandOnboardingStatus brandName={brand.name} variant="card" />
        <article className="panel summaryCard">
          <p className="eyebrow">接入目的</p>
          <h3>让系统先理解品牌，再替你判断热点</h3>
          <p className="muted">这一步不是行政填写，而是为后面的选题、改稿和借势建立上下文。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">保存方式</p>
          <h3>当前接入草稿会保存到本地浏览器</h3>
          <p className="muted">所以你可以分几次慢慢补，不需要一次性填完。</p>
        </article>
      </section>

      <BrandOnboardingWizard
        audiences={brand.audiences}
        brandName={brand.name}
        recentMoves={brand.recentMoves}
        redLines={brand.redLines}
        sector={brand.sector}
        slogan={brand.slogan}
        sourceLabels={brand.sources.map((item) => item.label)}
        tone={brand.tone}
        topics={brand.topics}
      />
    </div>
  );
}
