import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callAI,
  formatAIError,
  analyzeMindset,
  fetchWithRetry,
  validateMindsetAnalysis,
  coerceStringArray,
} from "./ai";
import type { AIConfig, MindsetAnalysis } from "./ai";
import type { Card } from "./types";
import { t } from "./i18n";

// ── Helpers ──────────────────────────────────────────────────

const openaiConfig: AIConfig = {
  apiKey: "test-openai-key",
  baseUrl: "https://api.openai.com",
  model: "gpt-4",
};

const anthropicConfig: AIConfig = {
  apiKey: "test-anthropic-key",
  baseUrl: "https://api.anthropic.com",
  model: "claude-3-5-sonnet-20241022",
};

const deepseekConfig: AIConfig = {
  apiKey: "test-deepseek-key",
  // no baseUrl → defaults to deepseek
};

function makeCard(id: string): Card {
  return {
    id,
    content: `content-${id}`,
    source: { url: "https://example.com", title: `title-${id}` },
    createdAt: Date.now(),
  };
}

// ── Mocks ────────────────────────────────────────────────────

// We need to access the non-exported functions. Since they are module-scoped,
// we test them indirectly through the exported functions, except for the ones
// that were exported for testability (validateMindsetAnalysis, coerceStringArray).
// For callAI / fetchWithRetry / formatAIError we mock global.fetch.

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── callAI ───────────────────────────────────────────────────

describe("callAI", () => {
  it("constructs OpenAI-compatible request (non-anthropic baseUrl)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await callAI(openaiConfig, "sys", "usr", false);

    expect(result).toBe("hello");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // fetchWithRetry calls fetch directly; the URL should end with /v1/chat/completions
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer test-openai-key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.temperature).toBe(0.7);
    // jsonMode=false → no response_format
    expect(body.response_format).toBeUndefined();
  });

  it("includes response_format when jsonMode=true (OpenAI branch)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"themes":[]}' } }],
        }),
        { status: 200 }
      )
    );

    await callAI(openaiConfig, "sys", "usr", true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("constructs Anthropic request when baseUrl contains anthropic.com", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ text: "bonjour" }],
        }),
        { status: 200 }
      )
    );

    const result = await callAI(anthropicConfig, "sys", "usr", false);

    expect(result).toBe("bonjour");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-anthropic-key");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    // No Authorization header for Anthropic
    expect(init.headers["Authorization"]).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-3-5-sonnet-20241022");
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
    expect(body.max_tokens).toBe(1600);
  });

  it("uses Anthropic max_tokens=2048 when jsonMode=true", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ text: '{"ok":true}' }],
        }),
        { status: 200 }
      )
    );

    await callAI(anthropicConfig, "sys", "usr", true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(2048);
  });

  it("defaults to deepseek baseUrl and model when no baseUrl provided", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hi" } }],
        }),
        { status: 200 }
      )
    );

    await callAI(deepseekConfig, "sys", "usr", false);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-chat");
  });

  it("throws on non-ok response via formatAIError", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "bad request" } }), {
        status: 400,
      })
    );

    await expect(callAI(openaiConfig, "sys", "usr", false)).rejects.toThrow(
      /AI API error: 400 bad request/
    );
  });

  it("throws 'Empty AI response' when content is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
      })
    );

    await expect(callAI(openaiConfig, "sys", "usr", false)).rejects.toThrow(
      "Empty AI response"
    );
  });
});

// ── formatAIError ────────────────────────────────────────────

describe("formatAIError", () => {
  it("extracts data.message", async () => {
    const res = new Response(JSON.stringify({ message: "rate limited" }), {
      status: 429,
    });
    const msg = await formatAIError(res);
    expect(msg).toBe("AI API error: 429 rate limited");
  });

  it("extracts data.error.message", async () => {
    const res = new Response(
      JSON.stringify({ error: { message: "invalid key" } }),
      { status: 401 }
    );
    const msg = await formatAIError(res);
    expect(msg).toBe("AI API error: 401 invalid key");
  });

  it("falls back to raw text when JSON parse fails", async () => {
    const res = new Response("something went wrong", { status: 500 });
    const msg = await formatAIError(res);
    expect(msg).toBe("AI API error: 500 something went wrong");
  });
});

// ── fetchWithRetry ───────────────────────────────────────────

describe("fetchWithRetry", () => {
  it("retries on 429 and succeeds on second attempt", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

    const promise = fetchWithRetry("https://example.com", {}, 1, 1000);
    // Advance past the retry delay
    await vi.advanceTimersByTimeAsync(1500);
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry on non-429 status", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not found", { status: 404 })
    );

    const res = await fetchWithRetry("https://example.com", {}, 1, 1000);
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 429 response when retries exhausted", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(new Response("", { status: 429 }));

    const promise = fetchWithRetry("https://example.com", {}, 1, 100);
    await vi.advanceTimersByTimeAsync(500);
    const res = await promise;

    expect(res.status).toBe(429);
    // 1 initial + 1 retry = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ── coerceStringArray ────────────────────────────────────────

describe("coerceStringArray", () => {
  it("returns the array as-is when all elements are strings", () => {
    expect(coerceStringArray(["a", "b"])).toEqual(["a", "b"]);
  });

  it("filters out non-string elements", () => {
    expect(coerceStringArray(["a", 1, null, "b"] as unknown[])).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns null when array has no string elements", () => {
    expect(coerceStringArray([1, 2, null])).toBeNull();
  });

  it("wraps a bare string into [string]", () => {
    expect(coerceStringArray("hello")).toEqual(["hello"]);
  });

  it("returns null for other types", () => {
    expect(coerceStringArray(42)).toBeNull();
    expect(coerceStringArray(null)).toBeNull();
    expect(coerceStringArray(undefined)).toBeNull();
  });
});

// ── validateMindsetAnalysis ──────────────────────────────────

describe("validateMindsetAnalysis", () => {
  const valid: MindsetAnalysis = {
    themes: ["t1"],
    patterns: ["p1"],
    evolution: "evolving",
    connections: ["c1"],
  };

  it("passes a valid object through", () => {
    const result = validateMindsetAnalysis(valid, "en");
    expect(result).toEqual(valid as MindsetAnalysis);
  });

  it("throws when themes is not an array", () => {
    const bad = { ...valid, themes: "not-array" };
    // "not-array" is a string → coerceStringArray wraps it into ["not-array"],
    // so this should actually pass. Let's test with a number instead.
    const bad2 = { ...valid, themes: 42 };
    expect(() => validateMindsetAnalysis(bad2, "en")).toThrow(
      t("aiInvalidResponse", "en")
    );
  });

  it("throws when themes is an empty array", () => {
    const bad = { ...valid, themes: [] };
    expect(() => validateMindsetAnalysis(bad, "en")).toThrow(
      t("aiInvalidResponse", "en")
    );
  });

  it("throws when evolution is missing", () => {
    const bad = { ...valid, evolution: "" };
    expect(() => validateMindsetAnalysis(bad, "en")).toThrow(
      t("aiInvalidResponse", "en")
    );
  });

  it("throws when input is not an object", () => {
    expect(() => validateMindsetAnalysis(null, "en")).toThrow(
      t("aiInvalidResponse", "en")
    );
    expect(() => validateMindsetAnalysis("string", "en")).toThrow(
      t("aiInvalidResponse", "en")
    );
  });

  it("coerces a bare string field into [string]", () => {
    const coerced = { ...valid, themes: "single-theme" };
    const result = validateMindsetAnalysis(coerced, "en");
    expect(result.themes).toEqual(["single-theme"]);
  });
});

// ── analyzeMindset ───────────────────────────────────────────

describe("analyzeMindset", () => {
  // We mock callAI indirectly by mocking fetch, since analyzeMindset calls callAI.
  // But callAI is in the same module — we need to mock fetch at the global level.

  const cards = [makeCard("1"), makeCard("2")];

  function mockAIResponse(content: string) {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
        }),
        { status: 200 }
      )
    );
  }

  it("parses pure JSON response", async () => {
    const json = JSON.stringify({
      themes: ["curiosity"],
      patterns: ["exploratory"],
      evolution: "growing",
      connections: ["tech-art"],
    });
    mockAIResponse(json);

    const result = await analyzeMindset(openaiConfig, cards, "en");
    expect(result.themes).toEqual(["curiosity"]);
    expect(result.evolution).toBe("growing");
  });

  it("extracts JSON from markdown code fence", async () => {
    const obj = {
      themes: ["t"],
      patterns: ["p"],
      evolution: "e",
      connections: ["c"],
    };
    const fenced = "```json\n" + JSON.stringify(obj) + "\n```";
    mockAIResponse(fenced);

    const result = await analyzeMindset(openaiConfig, cards, "en");
    expect(result.themes).toEqual(["t"]);
  });

  it("extracts JSON from curly-brace block when no fence", async () => {
    const obj = {
      themes: ["t"],
      patterns: ["p"],
      evolution: "e",
      connections: ["c"],
    };
    const wrapped = "Here is the result:\n" + JSON.stringify(obj) + "\nDone.";
    mockAIResponse(wrapped);

    const result = await analyzeMindset(openaiConfig, cards, "en");
    expect(result.themes).toEqual(["t"]);
  });

  it("throws on completely invalid response", async () => {
    mockAIResponse("this is not json at all");

    await expect(
      analyzeMindset(openaiConfig, cards, "en")
    ).rejects.toThrow();
  });

  it("throws when cards array is empty", async () => {
    await expect(
      analyzeMindset(openaiConfig, [], "en")
    ).rejects.toThrow(t("mindsetEmpty", "en"));
  });

  it("throws when parsed JSON fails runtime validation", async () => {
    // themes is missing
    mockAIResponse(
      JSON.stringify({ patterns: ["p"], evolution: "e", connections: ["c"] })
    );

    await expect(
      analyzeMindset(openaiConfig, cards, "en")
    ).rejects.toThrow(t("aiInvalidResponse", "en"));
  });
});
