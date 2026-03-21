import { SectionHeader } from "@/components/section-header";
import { getBrandStrategyPack } from "@/lib/data";
import { getBrandBrainSummary } from "@/lib/services/brand-brain";

export default async function BrandsPage() {
  const brandStrategyPack = await getBrandStrategyPack();
  const summary = getBrandBrainSummary(brandStrategyPack);

  return (
    <div className="page">
      <SectionHeader
        title="品牌策略包"
        description="自动抓取为主，客户补充为辅，稳定层和时效层分开维护。"
      />

      <section className="grid grid-2">
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
              <p className="eyebrow">策略边界</p>
              <h3>语气、竞品、禁区</h3>
            </div>
          </div>
          <div className="stack">
            <div>
              <strong>目标客群</strong>
              <p className="muted">{brandStrategyPack.audiences.join(" / ")}</p>
            </div>
            <div>
              <strong>风格</strong>
              <p className="muted">{brandStrategyPack.tone.join(" / ")}</p>
            </div>
            <div>
              <strong>竞品</strong>
              <p className="muted">{brandStrategyPack.competitors.join(" / ")}</p>
            </div>
            <div>
              <strong>禁区</strong>
              <ul className="simpleList">
                {brandStrategyPack.redLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">数据源</p>
            <h3>系统自动抓取与客户补充</h3>
          </div>
        </div>
        <div className="table">
          <div className="tableRow tableHead">
            <span>名称</span>
            <span>类型</span>
            <span>层级</span>
            <span>说明</span>
          </div>
          {brandStrategyPack.sources.map((source) => (
            <div className="tableRow" key={source.label}>
              <span>{source.label}</span>
              <span>{source.type}</span>
              <span>{source.freshness}</span>
              <span>{source.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
