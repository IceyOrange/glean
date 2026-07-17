import { describe, it, expect } from "vitest";
import { getTranslations } from "./i18n";

describe("i18n", () => {
  it("all languages expose the same key set", () => {
    const zhKeys = Object.keys(getTranslations("zh")).sort();
    for (const lang of ["en", "fr"] as const) {
      expect(Object.keys(getTranslations(lang)).sort()).toEqual(zhKeys);
    }
  });
});
