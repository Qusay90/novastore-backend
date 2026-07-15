interface ResourceStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ResourceState({ title, message, actionLabel, onAction }: ResourceStateProps) {
  return <section className="resource-state" role="status"><span className="eyebrow">NovaStore</span><h2>{title}</h2><p>{message}</p>{actionLabel && onAction ? <button className="button secondary" onClick={onAction}>{actionLabel}</button> : null}</section>;
}
