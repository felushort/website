export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
