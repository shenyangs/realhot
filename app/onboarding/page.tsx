import Link from "next/link";
import { BrandOnboardingStatus } from "@/components/brand-onboarding-status";
import { BrandOnboardingWizard } from "@/components/brand-onboarding-wizard";
import { PageHero } from "@/components/page-hero";
import { getBrandStrategyPack } from "@/lib/data";

export default async function OnboardingPage() {
  const brand = await getBrandStrategyPack();

  return (
    <div className="page onboardingPage">
      <PageHero
        actions={
          <>
          <Link className="buttonLike subtleButton" href="/brands">
            查看品牌系统
          </Link>
          <Link className="buttonLike primaryButton" href="/">
            返回工作台
          </Link>
          </>
        }
        description="补齐品牌基础、方向与表达边界。"
        eyebrow="品牌接入"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "重点主题", value: brand.topics.slice(0, 2).join(" / ") },
          { label: "品牌语气", value: brand.tone.slice(0, 2).join(" / ") },
          { label: "资料来源", value: `${brand.sources.length} 项` }
        ]}
        context={brand.name}
        title="品牌接入"
      />

      <section className="summaryGrid">
        <BrandOnboardingStatus brandName={brand.name} variant="card" />
        <article className="panel summaryCard">
          <p className="eyebrow">上下文</p>
          <h3>品牌理解</h3>
          <p className="muted">后续选题、改稿与借势都基于这里的设定。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">草稿</p>
          <h3>本地保存</h3>
          <p className="muted">可以分阶段补充，无需一次完成。</p>
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
