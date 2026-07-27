import { useState, useEffect } from "react";
import { Card } from "@/lib/types";
import { getActiveCards } from "@/lib/storage";

/**
 * Manages the card list: loads active (non-tombstoned) cards from storage on
 * mount and stays in sync via chrome.storage.onChanged.
 */
export function useJournalCards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveCards().then((c) => {
      setCards(c);
      setLoading(false);
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes.glean_cards) {
        // Re-filter tombstones from the raw storage value.
        const all = (changes.glean_cards.newValue as Card[] | undefined) ?? [];
        setCards(all.filter((c) => !c.deletedAt));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return { cards, setCards, loading };
}
