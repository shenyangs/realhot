import Link from "next/link";
import { BrandAutofillPanel } from "@/components/brand-autofill-panel";
import { BrandOnboardingStatus } from "@/components/brand-onboarding-status";
import { PageHero } from "@/components/page-hero";
import { getBrandStrategyPack, getPrioritizedHotspots, getReviewQueue } from "@/lib/data";

const sourceTypeLabels: Record<string, string> = {
  website: "官网 / 产品页",
  "knowledge-base": "知识库",
  "wechat-history": "公众号历史内容",
  event: "活动资料",
  press: "媒体新闻稿"
};

function getMaterialCompletionPercent(stableCount: number, timelyCount: number) {
  return Math.min(100, Math.round(((stableCount + timelyCount) / 6) * 100));
}

function getExpressionRiskLevel(missingCount: number, redLineCount: number) {
  if (missingCount >= 3 || redLineCount <= 2) {
    return "中";
  }

  return "低";
}

export default async function BrandsPage() {
  const [brandStrategyPack, prioritizedHotspots, packs] = await Promise.all([
    getBrandStrategyPack(),
    getPrioritizedHotspots(),
    getReviewQueue()
  ]);

  const stableSources = brandStrategyPack.sources.filter((source) => source.freshness === "stable");
  const timelySources = brandStrategyPack.sources.filter((source) => source.freshness === "timely");
  const materialsMissing = [
    stableSources.some((source) => source.type === "website") ? null : "官网 / 产品页",
    stableSources.some((source) => source.type === "wechat-history") ? null : "公众号历史内容",
    timelySources.some((source) => source.type === "event") ? null : "近期 campaign / 活动资料",
    timelySources.some((source) => source.type === "press") ? null : "近期媒体新闻稿",
    brandStrategyPack.redLines.length >= 3 ? null : "禁用表达范例",
    brandStrategyPack.topics.length >= 3 ? null : "用户高频情绪词"
  ].filter(Boolean) as string[];
  const completionPercent = getMaterialCompletionPercent(stableSources.length, timelySources.length);
  const hotspotHitCount = prioritizedHotspots.filter((item) => item.brandFitScore >= 80).length;
  const recentUsageCount = packs.length;
  const expressionRisk = getExpressionRiskLevel(materialsMissing.length, brandStrategyPack.redLines.length);
  const representativeCases = packs.slice(0, 3);

  return (
    <div className="page brandSystemPageV2">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#brand-preparedness">
              继续完善品牌规则
            </Link>
            <Link className="buttonLike subtleButton" href="/onboarding">
              打开接入流程
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
          </>
        }
        context={brandStrategyPack.name}
        description="先统一品牌定位、受众、语调和风险边界，后面的热点判断和内容生产才不会跑偏。"
        eyebrow="品牌底盘"
        facts={[
          { label: "品牌名称", value: brandStrategyPack.name },
          { label: "资料完整度", value: `${completionPercent}%` },
          { label: "内容调用规模", value: `${recentUsageCount} 条在流转` },
          { label: "高相关热点", value: `${hotspotHitCount} 条` },
          { label: "表达风险等级", value: `${expressionRisk}风险` },
          { label: "行业", value: brandStrategyPack.sector }
        ]}
        title="品牌规则从这里定"
      />

      <div className="brandOverviewGrid">
        <BrandOnboardingStatus brandName={brandStrategyPack.name} variant="card" />
        <article className="panel summaryCard">
          <p className="eyebrow">近期使用</p>
          <h3>{recentUsageCount} 次内容调用</h3>
          <p className="muted">最近进入生产链路的选题都会持续反哺品牌表达。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">热点命中</p>
          <h3>{hotspotHitCount} 条高相关热点</h3>
          <p className="muted">品牌相关性判断是后续选题与改写质量的基础。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">表达风险</p>
          <h3>{expressionRisk}风险</h3>
          <p className="muted">当前缺失项 {materialsMissing.length} 个，优先补齐高影响资料。</p>
        </article>
      </div>

      <BrandAutofillPanel compact initialBrandName={brandStrategyPack.name} />

      <div className="brandCoreGrid">
        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">品牌定位</p>
              <h2>品牌战略定位与价值主张</h2>
            </div>
          </div>

          <div className="brandNarrativeSection">
            <p className="brandLeadText">{brandStrategyPack.slogan}</p>
            <div className="tagRow">
              {brandStrategyPack.topics.map((topic) => (
                <span className="tag" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
            <div className="definitionList compactDefinitionList">
              <div>
                <span>品牌定位</span>
                <strong>{brandStrategyPack.positioning.join("；")}</strong>
              </div>
              <div>
                <span>适用场景</span>
                <strong>{brandStrategyPack.sector}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">用户画像</p>
              <h2>核心受众与决策角色</h2>
            </div>
          </div>

          <div className="brandNarrativeSection">
            <div className="tagRow">
              {brandStrategyPack.audiences.map((audience) => (
                <span className="tag" key={audience}>
                  {audience}
                </span>
              ))}
            </div>
            <p className="muted">这些画像决定议题切入角度与论证深度，而不仅是投放渠道选择。</p>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">内容语气</p>
              <h2>品牌语调与表达规范</h2>
            </div>
          </div>

          <div className="brandNarrativeSection">
            <div className="tagRow">
              {brandStrategyPack.tone.map((tone) => (
                <span className="tag" key={tone}>
                  {tone}
                </span>
              ))}
            </div>
            <p className="muted">这是系统默认语调基线，直接影响选题判断、正文改写与审核标准。</p>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">可说范围</p>
              <h2>优先传播主题</h2>
            </div>
          </div>

          <ul className="simpleList">
            {brandStrategyPack.topics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
            {brandStrategyPack.recentMoves.slice(0, 2).map((move) => (
              <li key={move}>{move}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">禁说范围</p>
              <h2>审核红线与合规边界</h2>
            </div>
          </div>

          <ul className="simpleList">
            {brandStrategyPack.redLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">近期动态</p>
              <h2>近期业务动态与传播重点</h2>
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
        </section>
      </div>

      <section className="panel" id="brand-preparedness">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">品牌准备度</p>
            <h2>还差什么，直接补哪里</h2>
          </div>
        </div>

        <div className="brandPreparednessGrid">
          <article className="subPanel">
            <strong>当前完整度</strong>
            <p className="brandLeadText">{completionPercent}%</p>
            <p className="muted">稳定层资料 {stableSources.length} 项，时效层资料 {timelySources.length} 项。</p>
          </article>

          <article className="subPanel">
            <strong>当前缺失项</strong>
            <ul className="simpleList">
              {materialsMissing.length > 0 ? (
                materialsMissing.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>核心资料已覆盖，可继续补高表现案例与近期 campaign 数据。</li>
              )}
            </ul>
          </article>

          <article className="subPanel">
            <strong>建议下一步</strong>
            <div className="buttonRow brandActionRow">
              <Link className="buttonLike subtleButton" href="/onboarding#recent">
                去补充近期品牌动态
              </Link>
              <Link className="buttonLike subtleButton" href="/onboarding#rules">
                去添加风险表达规则
              </Link>
              <Link className="buttonLike subtleButton" href="#brand-assets">
                去导入代表性案例
              </Link>
            </div>
          </article>
        </div>
      </section>

      <div className="brandSupportGrid">
        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">历史高表现案例</p>
              <h2>可复用的表达样本</h2>
            </div>
          </div>

          <div className="caseSampleList">
            {representativeCases.length > 0 ? (
              representativeCases.map((pack) => (
                <div className="caseSampleItem" key={pack.id}>
                  <strong>{pack.variants[0]?.title ?? pack.whyNow}</strong>
                  <p className="muted">{pack.whyUs}</p>
                </div>
              ))
            ) : (
              <div className="systemFeedbackCard systemFeedbackCardCompact">
                <strong>当前还没有可复用案例</strong>
                <p className="muted">当更多选题进入生产后，这里会沉淀稳定的品牌表达样本。</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel" id="brand-assets">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">素材资产</p>
              <h2>品牌资产库</h2>
            </div>
          </div>

          <div className="sourceLibraryGrid">
            <article className="subPanel">
              <strong>核心规则</strong>
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
              <strong>补充信息</strong>
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
    </div>
  );
}
