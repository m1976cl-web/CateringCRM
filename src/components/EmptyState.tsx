import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function EmptyState({
  title,
  description,
  actionTo,
  actionLabel,
}: {
  title: string;
  description: string;
  actionTo?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {actionTo && actionLabel ? (
        <Link to={actionTo} className="btn primary">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
