import { describe, expect, it } from "vitest";
import { buildFeedbackUrl, feedbackTemplateUrl, getFeedbackDiagnostics } from "./feedback";

describe("feedback helpers", () => {
  it("uses the matching issue template for each feedback type", () => {
    expect(feedbackTemplateUrl("bug")).toContain("template=bug_report.md");
    expect(feedbackTemplateUrl("feature")).toContain("template=feature_request.md");
    expect(feedbackTemplateUrl("feedback")).toContain("template=feedback.md");
  });

  it("only includes explicitly supplied diagnostics in a drafted report", () => {
    const url = new URL(
      buildFeedbackUrl({
        kind: "bug",
        message: "Saving a selection did not work.",
        diagnostics: { extensionVersion: "0.2.20", browser: "Firefox", operatingSystem: "macOS" },
      }),
    );

    expect(url.searchParams.get("body")).toContain("Glean version: 0.2.20");
    expect(url.searchParams.get("body")).not.toContain("https://");
  });

  it("reduces the browser environment to a small diagnostic summary", () => {
    expect(
      getFeedbackDiagnostics({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit Chrome/128.0",
        extensionVersion: "0.2.20",
      }),
    ).toEqual({ extensionVersion: "0.2.20", browser: "Chrome", operatingSystem: "macOS" });
  });
});
