interface EmptyStateProps {
  query: string;
  noMatch: string;
  noCards: string;
  emptyDesc: string;
  /** Three short how-to steps shown only when the journal has no cards at all. */
  guideSteps: string[];
}

export function EmptyState({ query, noMatch, noCards, emptyDesc, guideSteps }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="font-quote italic text-[64px] leading-none text-seal/20 select-none">“</div>
      <p className="mt-4 font-quote text-[17px] text-ink-800">
        {query ? noMatch : noCards}
      </p>
      {!query && (
        <>
          <p className="text-xs text-ink-500 mt-2 max-w-xs leading-relaxed">
            {emptyDesc}
          </p>
          <div className="mt-12 flex items-start justify-center gap-6 sm:gap-10">
            {guideSteps.map((step, i) => (
              <div key={i} className="flex flex-col items-center gap-2.5 max-w-[130px]">
                <span className="font-quote italic text-[20px] leading-none text-seal/60">
                  {i + 1}
                </span>
                <span className="h-px w-6 bg-line" aria-hidden="true" />
                <span className="text-[11px] leading-relaxed text-ink-500">{step}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
