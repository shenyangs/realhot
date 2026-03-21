import Link from "next/link";
import { getBrandStrategyPack, getPrioritizedHotspots, getReviewQueue } from "@/lib/data";

function getActionLabel(action: "ship-now" | "watch" | "discard") {
  if (action === "ship-now") {
    return "建议立刻跟进";
  }

  if (action === "watch") {
    return "建议继续观察";
  }

  return "建议放弃";
}

function getActionTone(action: "ship-now" | "watch" | "discard") {
  if (action === "ship-now") {
    return "positive";
  }

  if (action === "watch") {
    return "warning";
  }

  return "neutral";
}

function getWindowLabel(score: number) {
  if (score >= 85) {
    return "还在快反窗口内";
  }

  if (score >= 70) {
    return "更适合今天内沉淀成观点";
  }

  return "可以继续观察，不急着立题";
}

function getKindLabel(kind: "industry" | "mass" | "brand") {
  if (kind === "industry") {
    return "行业热点";
  }

  if (kind === "mass") {
    return "大众/平台热点";
  }

  return "品牌/竞品热点";
}

export default async function HotspotsPage() {
  const [brand, prioritized, packs] = await Promise.all([
    getBrandStrategyPack(),
    getPrioritizedHotspots(),
    getReviewQueue()
  ]);

  const shipNow = prioritized.filter((signal) => signal.recommendedAction === "ship-now");
  const watchList = prioritized.filter((signal) => signal.recommendedAction === "watch");
  const discardList = prioritized.filter((signal) => signal.recommendedAction === "discard");
  const activeHotspotIds = new Set(packs.map((pack) => pack.hotspotId));

  return (
    <div className="page hotspotPoolPage">
      <section className="hotspotHero panel">
        <div className="hotspotHeroCopy">
          <p className="eyebrow">热点机会池</p>
          <h2>这里不是看热闹，而是判断今天哪些机会值得转成选题。</h2>
          <p className="muted heroText">
            系统会优先按 {brand.name} 的行业方向、品牌边界、近期动态和中国平台传播语境来筛机会。你在这里做的不是“浏览热点”，而是决定哪些题值得进入生产。
          </p>
          <div className="buttonRow">
            <Link className="buttonLike primaryButton" href="/">
              回到今日选题台
            </Link>
            <Link className="buttonLike subtleButton" href="/brands">
              看品牌与规则
            </Link>
          </div>
        </div>

        <div className="hotspotHeroMeta">
          <div className="metaPill">
            <span>当前品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="metaPill">
            <span>判断重点</span>
            <strong>先行业热点，再大众热点，竞品只作为差异化参考</strong>
          </div>
          <div className="metaPill">
            <span>当前机会量</span>
            <strong>{prioritized.length} 个机会，{shipNow.length} 个建议今天处理</strong>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">建议立刻跟进</p>
          <h3>{shipNow.length} 个</h3>
          <p className="muted">这些热点和品牌相关度高、窗口还在，适合直接转成今日选题。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">建议继续观察</p>
          <h3>{watchList.length} 个</h3>
          <p className="muted">更适合沉淀成观点，或者等更多行业信号出现后再立题。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">已进入生产</p>
          <h3>{packs.length} 个热点包</h3>
          <p className="muted">这些机会已经被转成选题任务，接下来重点看改稿、审核和发布节奏。</p>
        </article>
      </section>

      <div className="hotspotPoolLayout">
        <main className="hotspotMainColumn">
          <section className="panel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">优先处理</p>
                <h3>先把今天最值得做的题挑出来</h3>
              </div>
            </div>

            <div className="hotspotCardList">
              {prioritized.map((signal) => {
                const alreadyInProduction = activeHotspotIds.has(signal.id);

                return (
                  <article className="hotspotCard" key={signal.id}>
                    <div className="hotspotCardHeader">
                      <div className="hotspotCardTitle">
                        <div className="tagRow">
                          <span className={`pill pill-${getActionTone(signal.recommendedAction)}`}>
                            {getActionLabel(signal.recommendedAction)}
                          </span>
                          <span className="tag">{getKindLabel(signal.kind)}</span>
                          {alreadyInProduction ? (
                            <span className="pill pill-neutral">已进入生产</span>
                          ) : null}
                        </div>
                        <h3>{signal.title}</h3>
                      </div>
                      <div className="scorePanel">
                        <span>优先级</span>
                        <strong>{signal.priorityScore}</strong>
                      </div>
                    </div>

                    <p className="muted">{signal.summary}</p>

                    <div className="hotspotFactsGrid">
                      <div>
                        <span>为什么值得看</span>
                        <strong>{signal.reasons[0] ?? "已命中品牌核心话题"}</strong>
                      </div>
                      <div>
                        <span>建议切入</span>
                        <strong>{signal.reasons[1] ?? "优先转成行业判断或品牌观点"}</strong>
                      </div>
                      <div>
                        <span>时效窗口</span>
                        <strong>{getWindowLabel(signal.velocityScore)}</strong>
                      </div>
                      <div>
                        <span>热源</span>
                        <strong>{signal.source}</strong>
                      </div>
                    </div>

                    <div className="hotspotMetricRow">
                      <span>相关性 {signal.relevanceScore}</span>
                      <span>行业性 {signal.industryScore}</span>
                      <span>速度 {signal.velocityScore}</span>
                      <span>风险 {signal.riskScore}</span>
                      <span>{signal.detectedAt}</span>
                    </div>

                    <div className="hotspotCardFooter">
                      <div className="hotspotDecisionNote">
                        <strong>处理建议</strong>
                        <p className="muted">
                          {signal.recommendedAction === "ship-now"
                            ? "适合今天直接立题并进入内容生产。"
                            : signal.recommendedAction === "watch"
                              ? "先保留在机会池，等更多讨论信号出现后再转成选题。"
                              : "暂时不建议占用团队精力。"}
                        </p>
                      </div>
                      <div className="buttonRow">
                        <Link className="buttonLike subtleButton" href={alreadyInProduction ? "/review" : "/"}>
                          {alreadyInProduction ? "去看已生成草稿" : "转回今日选题台处理"}
                        </Link>
                        <Link className="buttonLike" href="/brands">
                          看品牌规则
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="hotspotAsideColumn">
          <section className="panel helperPanel">
            <p className="eyebrow">判断原则</p>
            <h3>团队在这里最该问的 3 个问题</h3>
            <div className="definitionList">
              <div>
                <span>第一问</span>
                <strong>这和品牌现在想强化的认知真的相关吗？</strong>
              </div>
              <div>
                <span>第二问</span>
                <strong>现在做还来得及吗，还是更适合沉淀观点？</strong>
              </div>
              <div>
                <span>第三问</span>
                <strong>做出来之后，能顺利落到小红书、公众号、视频号或抖音吗？</strong>
              </div>
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">品牌约束</p>
            <h3>当前会影响热点判断的规则</h3>
            <div className="tagRow">
              {brand.topics.map((topic) => (
                <span className="tag" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
            <ul className="simpleList">
              {brand.redLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">观察区</p>
            <h3>这些机会先别急着做</h3>
            <div className="watchList">
              {watchList.length > 0 ? (
                watchList.map((signal) => (
                  <div className="watchItem" key={signal.id}>
                    <strong>{signal.title}</strong>
                    <p className="muted">{signal.detectedAt}</p>
                  </div>
                ))
              ) : (
                <p className="emptyState">当前没有需要继续观察的机会，今天更适合直接处理高优先级热点。</p>
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">低优先级</p>
            <h3>暂时不建议占用精力</h3>
            <p className="muted">
              当前 {discardList.length} 个机会不建议进入生产，避免团队被低相关、低时效或高风险内容分散注意力。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
