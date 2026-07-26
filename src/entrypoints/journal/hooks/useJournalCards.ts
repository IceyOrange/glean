import { useState, useEffect } from "react";
import { Card } from "@/lib/types";
import { getCards } from "@/lib/storage";

/**
 * Manages the card list: loads from storage on mount and stays in sync
 * via chrome.storage.onChanged.
 */
export function useJournalCards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCards().then((c) => {
      setCards(c);
      setLoading(false);
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes.glean_cards) {
        setCards(changes.glean_cards.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return { cards, setCards, loading };
}
