interface EmptyStateProps {
  query: string;
  noMatch: string;
  noCards: string;
  emptyDesc: string;
}

export function EmptyState({ query, noMatch, noCards, emptyDesc }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="font-quote italic text-[44px] leading-none text-seal/30 mb-4 select-none">“</div>
      <p className="text-sm text-ink-400">
        {query ? noMatch : noCards}
      </p>
      {!query && (
        <p className="text-xs text-ink-300 mt-2 max-w-xs leading-relaxed">
          {emptyDesc}
        </p>
      )}
    </div>
  );
}
