import Link from "next/link";
import { BrandAutofillPanel } from "@/components/brand-autofill-panel";
import { BrandOnboardingStatus } from "@/components/brand-onboarding-status";
import { PageHero } from "@/components/page-hero";
import { getBrandStrategyPack } from "@/lib/data";
import { getBrandBrainSummary } from "@/lib/services/brand-brain";

const sourceTypeLabels: Record<string, string> = {
  website: "官网/产品页",
  "knowledge-base": "知识库",
  "wechat-history": "公众号历史内容",
  event: "活动资料",
  press: "媒体新闻稿"
};

const onboardingStepLabels = [
  {
    step: "01",
    title: "品牌基础",
    description: "先让系统知道你是谁、卖什么、面向谁。"
  },
  {
    step: "02",
    title: "传播目标",
    description: "告诉系统今年想强化什么认知、优先在哪些平台输出。"
  },
  {
    step: "03",
    title: "表达规则",
    description: "把语气、禁区、竞品边界提前讲清楚。"
  },
  {
    step: "04",
    title: "素材与资料",
    description: "补齐品牌手册、产品资料、案例和过往内容资产。"
  },
  {
    step: "05",
    title: "近期动态",
    description: "最近一个月活动和媒体稿会直接影响热点借势质量。"
  }
];

const recommendedAssets = [
  {
    title: "品牌介绍 / 手册",
    reason: "帮助系统理解你是谁，后续写作不容易偏题。"
  },
  {
    title: "产品资料",
    reason: "让观点内容更具体，不会只停留在抽象概念。"
  },
  {
    title: "客户案例",
    reason: "让品牌观点更可信，也方便写成公众号和视频号内容。"
  },
  {
    title: "历史爆文 / 创始人观点",
    reason: "更容易形成稳定口吻，不会写得像统一模板。"
  }
];

export default async function BrandsPage() {
  const brandStrategyPack = await getBrandStrategyPack();
  const summary = getBrandBrainSummary(brandStrategyPack);
  const stableSources = brandStrategyPack.sources.filter((source) => source.freshness === "stable");
  const timelySources = brandStrategyPack.sources.filter((source) => source.freshness === "timely");
  const materialsMissing = [
    stableSources.some((source) => source.type === "website") ? null : "官网/产品页",
    stableSources.some((source) => source.type === "wechat-history") ? null : "公众号历史文章",
    timelySources.some((source) => source.type === "event") ? null : "最近一个月活动资料",
    timelySources.some((source) => source.type === "press") ? null : "最近一个月媒体新闻稿"
  ].filter(Boolean) as string[];

  return (
    <div className="page brandsPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/">
              回到工作台
            </Link>
            <Link className="buttonLike subtleButton" href="/onboarding">
              重新走接入流程
            </Link>
            <a className="buttonLike subtleButton" href="#material-library">
              继续补资料
            </a>
          </>
        }
        description="查看品牌画像、表达边界与资料状态。"
        eyebrow="品牌系统"
        facts={[
          { label: "当前品牌", value: brandStrategyPack.name },
          { label: "所属行业", value: brandStrategyPack.sector },
          {
            label: "资料状态",
            value: materialsMissing.length === 0 ? "已具备完整接入条件" : "已具备基础运行条件"
          },
          { label: "稳定素材", value: `${stableSources.length} 项` }
        ]}
        context={brandStrategyPack.name}
        title="品牌系统"
      />

      <BrandOnboardingStatus brandName={brandStrategyPack.name} variant="card" />

      <BrandAutofillPanel initialBrandName={brandStrategyPack.name} />

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">品牌接入 5 步</p>
            <h3>接入流程</h3>
          </div>
        </div>

        <div className="onboardingGrid">
          {onboardingStepLabels.map((item, index) => (
            <article className="onboardingCard" key={item.step}>
              <span className="stepBadge">{item.step}</span>
              <strong>{item.title}</strong>
              <p className="muted">{item.description}</p>
              <small className="muted">
                {index < 3
                  ? "已整理为当前品牌默认规则"
                  : "可随时补充，系统会持续吸收"}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">品牌画像</p>
              <h3>{brandStrategyPack.name}</h3>
            </div>
            <span className="pill pill-positive">{brandStrategyPack.sector}</span>
          </div>
          <div className="stack">
            <p>{brandStrategyPack.slogan}</p>
            <div className="tagRow">
              {brandStrategyPack.topics.map((topic) => (
                <span className="tag" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
            {summary.map((item) => (
              <p className="muted" key={item}>
                {item}
              </p>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">传播目标</p>
              <h3>当前方向</h3>
            </div>
          </div>
          <div className="definitionList">
            <div>
              <span>目标客群</span>
              <strong>{brandStrategyPack.audiences.join(" / ")}</strong>
            </div>
            <div>
              <span>品牌定位</span>
              <strong>{brandStrategyPack.positioning.join("；")}</strong>
            </div>
            <div>
              <span>近期动作</span>
              <strong>{brandStrategyPack.recentMoves[0]}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">表达规则</p>
              <h3>表达边界</h3>
            </div>
          </div>
          <div className="definitionList">
            <div>
              <span>品牌语气</span>
              <strong>{brandStrategyPack.tone.join(" / ")}</strong>
            </div>
            <div>
              <span>竞品边界</span>
              <strong>{brandStrategyPack.competitors.join(" / ")}</strong>
            </div>
            <div>
              <span>禁区提醒</span>
              <ul className="simpleList">
                {brandStrategyPack.redLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">近期动态</p>
              <h3>最近更新</h3>
            </div>
          </div>
          <div className="timelineList">
            {brandStrategyPack.recentMoves.map((move) => (
              <div className="timelineItem" key={move}>
                <span className="timelineDot" />
                <p>{move}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="brandInfoGrid materialSection" id="material-library">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">推荐补充资料</p>
              <h3>建议补齐</h3>
            </div>
          </div>

          <div className="materialHintGrid">
            {recommendedAssets.map((asset) => (
              <article className="materialHintCard" key={asset.title}>
                <strong>{asset.title}</strong>
                <p className="muted">{asset.reason}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel materialHealthPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">资料完整度</p>
              <h3>{materialsMissing.length === 0 ? "已完整" : "待补充"}</h3>
            </div>
          </div>

          <p className="muted">
            {materialsMissing.length === 0
              ? "基础层和时效层资料都已具备，热点判断、观点内容和借势内容都会更稳。"
              : `建议优先补充：${materialsMissing.join("、")}。补齐之后，品牌相关性判断和改稿质量会更稳定。`}
          </p>

          <div className="definitionList">
            <div>
              <span>稳定层资料</span>
              <strong>{stableSources.length} 项</strong>
            </div>
            <div>
              <span>时效层资料</span>
              <strong>{timelySources.length} 项</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">素材与资料库</p>
            <h3>资料库</h3>
          </div>
        </div>

        <div className="sourceLibraryGrid">
          <article className="subPanel">
            <strong>品牌级长期素材</strong>
            <div className="sourceList">
              {stableSources.map((source) => (
                <div className="sourceItem" key={source.label}>
                  <div>
                    <strong>{source.label}</strong>
                    <p className="muted">{source.value}</p>
                  </div>
                  <span className="pill pill-neutral">{sourceTypeLabels[source.type] ?? source.type}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="subPanel">
            <strong>近期时效素材</strong>
            <div className="sourceList">
              {timelySources.map((source) => (
                <div className="sourceItem" key={source.label}>
                  <div>
                    <strong>{source.label}</strong>
                    <p className="muted">{source.value}</p>
                  </div>
                  <span className="pill pill-warning">{sourceTypeLabels[source.type] ?? source.type}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
