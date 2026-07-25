export function Skeleton() {
  return (
    <div className="animate-pulse space-y-12">
      {[0, 1].map((i) => (
        <div key={i} className="sm:grid sm:grid-cols-[72px_1fr]">
          {/* Date gutter */}
          <div className="hidden sm:block">
            <div className="ml-auto pt-6 pr-5 w-fit">
              <div className="h-7 w-8 bg-line-soft rounded" />
              <div className="mt-2 h-2.5 w-10 bg-line-soft rounded" />
              <div className="mt-1.5 h-2.5 w-9 bg-line-soft rounded" />
            </div>
          </div>
          {/* Entries */}
          <div className="sm:border-l sm:border-line-soft sm:pl-7">
            {[0, 1].map((j) => (
              <div key={j} className="py-6 border-b border-line-soft last:border-b-0">
                <div className="h-4 bg-line-soft rounded w-11/12 mb-3" />
                <div className="h-4 bg-line-soft rounded w-2/3 mb-4" />
                <div className="h-3 bg-line-soft rounded w-1/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
