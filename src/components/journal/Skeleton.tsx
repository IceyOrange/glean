export function Skeleton() {
  return (
    <div className="animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="py-5 border-b border-line-soft">
          <div className="h-4 bg-line-soft rounded w-11/12 mb-2.5" />
          <div className="h-4 bg-line-soft rounded w-2/3 mb-4" />
          <div className="h-3 bg-line-soft rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}
