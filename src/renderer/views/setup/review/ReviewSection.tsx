import type { JSX, ReactNode } from 'react';

export function ReviewSection({
  status, title, value, action,
}: {
  status: 'ok' | 'warn';
  title: string;
  value: string | ReactNode;
  action: ReactNode;
}): JSX.Element {
  return (
    <div className="review-section">
      <div className={`review-icon ${status}`}>{status === 'ok' ? '✓' : '!'}</div>
      <div className="review-content">
        <div className="review-name">{title}</div>
        <div className="review-value">{value}</div>
      </div>
      <div className="review-edit">{action}</div>
    </div>
  );
}
