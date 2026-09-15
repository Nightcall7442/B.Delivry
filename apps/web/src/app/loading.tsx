/**
 * Route-level loading UI.
 *
 */
export default function Loading() {
  return (
    <div className="container-site flex min-h-[60vh] items-center justify-center">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-500"
        role="status"
        aria-label="Загрузка"
      />
    </div>
  );
}
