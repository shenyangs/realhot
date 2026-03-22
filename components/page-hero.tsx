import type { ReactNode } from "react";

interface PageHeroFact {
  label: string;
  value: string;
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  facts,
  visual,
  variant = "utility",
  context
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  facts?: PageHeroFact[];
  visual?: ReactNode;
  variant?: "marketing" | "utility";
  context?: string;
}) {
  return (
    <section
      className={`pageHero panel ${visual ? "pageHeroWithVisual" : ""} ${variant === "marketing" ? "pageHeroMarketing" : "pageHeroUtility"}`}
    >
      <div className="pageHeroGrid">
        <div className="pageHeroContent">
          <p className="eyebrow">{eyebrow}</p>
          {context ? <p className="pageHeroContext">{context}</p> : null}
          <h1>{title}</h1>
          <p className="pageHeroDescription">{description}</p>
          {actions ? <div className="buttonRow pageHeroActions">{actions}</div> : null}
        </div>
        {visual ? <div className="pageHeroVisual">{visual}</div> : null}
      </div>

      {facts?.length ? (
        <div className="pageHeroFacts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
