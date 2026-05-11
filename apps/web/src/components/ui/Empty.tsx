export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-border bg-surface-2 p-12 text-center">
      <div className="text-[14px] font-medium text-text">{title}</div>
      {description && (
        <div className="mt-1 text-[12.5px] text-text-mute">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
