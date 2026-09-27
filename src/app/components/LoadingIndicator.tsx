import { LoaderCircle } from 'lucide-react';

export function LoadingIndicator({ label }: { label: string }) {
  return (
    <span aria-label={label} className="loading-indicator" role="status">
      <LoaderCircle aria-hidden="true" className="loading-indicator__icon" size={16} />
    </span>
  );
}
