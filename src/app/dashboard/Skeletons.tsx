/**
 * 載入中的骨架畫面。用在頁面內的 <Suspense>，不放 route 層 loading.tsx：
 * route 層的 loading 會讓頁面先開始串流，之後 notFound() 只能回 200，
 * 無法維持「他人的任務回 404」（PRD AC1.4）。
 */
export function JobListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="載入任務清單">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton h-9 w-full" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="載入分析報告">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-20" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="skeleton h-48" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" style={{ animationDelay: "120ms" }} />
      </div>
    </div>
  );
}
