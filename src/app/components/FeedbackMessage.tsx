import type { ReactNode } from 'react';

type FeedbackTone = 'error' | 'info';

type FeedbackMessageProps = {
  children: ReactNode;
  tone: FeedbackTone;
};

export function FeedbackMessage({ children, tone }: FeedbackMessageProps) {
  const role = tone === 'error' ? 'alert' : 'status';

  return (
    <p aria-atomic="true" className={`feedback-message feedback-message--${tone}`} role={role}>
      {children}
    </p>
  );
}
