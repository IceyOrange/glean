import { useState, useRef, useCallback } from "react";
import { Card } from "@/lib/types";
import {
  getAIConfig,
  askAboutCard,
  saveAskExchange,
  getAskHistory,
  type AskExchange,
} from "@/lib/ai";
import type { Lang } from "@/lib/i18n";

/**
 * Manages the "Ask about this card" panel state: which card is open,
 * conversation exchanges, loading/error, and the request-cancellation ref.
 */
export function useAskState() {
  const [askCardId, setAskCardId] = useState<string | null>(null);
  const [askExchanges, setAskExchanges] = useState<AskExchange[]>([]);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const askRequestRef = useRef(0);

  const resetAsk = useCallback(() => {
    setAskCardId(null);
    setAskExchanges([]);
    setAskError(null);
    setAskLoading(false);
  }, []);

  const handleToggleAskCard = useCallback(
    async (cardId: string, onOpenSettings: () => void) => {
      if (askCardId === cardId) {
        resetAsk();
        return;
      }

      const config = await getAIConfig();
      if (!config) {
        onOpenSettings();
        return;
      }

      const history = await getAskHistory(cardId);
      setAskCardId(cardId);
      setAskExchanges(history);
      setAskError(null);
      setAskLoading(false);
    },
    [askCardId, resetAsk],
  );

  const handleAsk = useCallback(
    async (
      cardId: string,
      question: string,
      cards: Card[],
      lang: Lang,
      genFailLabel: string,
      onOpenSettings: () => void,
    ) => {
      const config = await getAIConfig();
      if (!config) {
        onOpenSettings();
        return;
      }

      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      setAskLoading(true);
      setAskError(null);

      const requestId = ++askRequestRef.current;

      try {
        const answer = await askAboutCard(config, card, cards, question, lang);
        if (askRequestRef.current !== requestId) return;
        const exchange: AskExchange = { question, answer, createdAt: Date.now() };
        setAskExchanges((prev) => [...prev, exchange]);
        void saveAskExchange(cardId, exchange);
      } catch (err) {
        if (askRequestRef.current !== requestId) return;
        setAskError(err instanceof Error ? err.message : genFailLabel);
      } finally {
        if (askRequestRef.current === requestId) {
          setAskLoading(false);
        }
      }
    },
    [],
  );

  return {
    askCardId,
    askExchanges,
    askLoading,
    askError,
    resetAsk,
    handleToggleAskCard,
    handleAsk,
  };
}
