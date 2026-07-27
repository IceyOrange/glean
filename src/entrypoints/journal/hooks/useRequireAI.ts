import { useState, useEffect, useCallback } from "react";
import { getAIConfig, type AIConfig } from "@/lib/ai";

/**
 * Unified AI-configuration gate for any feature that requires AI.
 *
 * - `aiReady`: asynchronously loaded boolean — true once a config is found.
 * - `ensureAI()`: re-checks config (guards against mid-session clears),
 *   returns the config or calls `onMissing` and returns null.
 */
export function useRequireAI(onMissing: () => void): {
  ensureAI: () => Promise<AIConfig | null>;
  aiReady: boolean;
} {
  const [aiReady, setAiReady] = useState(false);

  // Load once on mount to surface the "not configured" visual state.
  useEffect(() => {
    let cancelled = false;
    getAIConfig().then((cfg) => {
      if (!cancelled) setAiReady(!!cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureAI = useCallback(async (): Promise<AIConfig | null> => {
    const config = await getAIConfig();
    if (!config) {
      setAiReady(false);
      onMissing();
      return null;
    }
    setAiReady(true);
    return config;
  }, [onMissing]);

  return { ensureAI, aiReady };
}
