export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className="inline-block animate-spin rounded-full border-2 border-border border-t-brand"
      style={{ width: size, height: size }}
    />
  );
}
