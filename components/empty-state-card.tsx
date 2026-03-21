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
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {href && actionLabel ? (
        <Link className="buttonLike subtleButton" href={href}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
