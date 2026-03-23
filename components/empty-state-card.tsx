import type { Route } from "next";
import Link from "next/link";

export function EmptyStateCard({
  eyebrow,
  title,
  description,
  href,
  actionLabel
}: {
  eyebrow: string;
  title: string;
  description: string;
  href?: Route;
  actionLabel?: string;
}) {
  return (
    <div className="emptyStateCard">
      <div className="emptyStateArtwork" aria-hidden="true">
        <span />
        <span />
        <span />
        <i />
      </div>
      <div className="emptyStateContent">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
        <small className="emptyStateHint">系统反馈会持续更新到这里。</small>
        {href && actionLabel ? (
          <Link className="buttonLike subtleButton" href={href}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
