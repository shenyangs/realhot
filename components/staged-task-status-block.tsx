"use client";

interface StagedTaskStatusBlockProps {
  eyebrow: string;
  title: string;
  progressLabel: string;
  progressValue: string;
  progressDescription: string;
  strategyTitle: string;
  strategyDescription: string;
  actionLabel?: string;
  actionBusyLabel?: string;
  actionDisabled?: boolean;
  isBusy?: boolean;
  onAction?: () => void;
  message?: string;
}

export function StagedTaskStatusBlock({
  eyebrow,
  title,
  progressLabel,
  progressValue,
  progressDescription,
  strategyTitle,
  strategyDescription,
  actionLabel,
  actionBusyLabel,
  actionDisabled = false,
  isBusy = false,
  onAction,
  message
}: StagedTaskStatusBlockProps) {
  return (
    <>
      <div className="panelHeader sectionTitle">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="summaryGrid stagedTaskStatusGrid">
        <article className="summaryCard">
          <p className="eyebrow">{progressLabel}</p>
          <h3>{progressValue}</h3>
          <p className="muted">{progressDescription}</p>
          {actionLabel && onAction ? (
            <div className="buttonRow">
              <button disabled={actionDisabled || isBusy} onClick={onAction} type="button">
                {isBusy ? actionBusyLabel ?? actionLabel : actionLabel}
              </button>
            </div>
          ) : null}
        </article>

        <article className="summaryCard">
          <p className="eyebrow">当前策略</p>
          <h3>{strategyTitle}</h3>
          <p className="muted">{strategyDescription}</p>
        </article>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </>
  );
}
