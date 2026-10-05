import { describe, expect, it } from "vitest";
import { analyzeExchange } from "../analysis/analyze";
import { HOLDING_TEMP_REQUEST, HOLDING_TEMP_RESPONSE, TEACHING_MAP_JSON } from "../examples";
import { buildEvidence, escapeMarkdownText, evidenceJson, renderMarkdown } from "./exportReport";

describe("evidence export", () => {
  it("separates generation time from capture time and keeps synthetic provenance", () => {
    const analysis = analyzeExchange({
      requestText: HOLDING_TEMP_REQUEST,
      responseText: HOLDING_TEMP_RESPONSE,
      mapText: TEACHING_MAP_JSON,
      captureTime: "2020-01-01T00:00:00Z",
      provenanceNote: "bench notebook, unverified",
      syntheticPresetId: "holding-temperature",
      syntheticPresetLabel: "Synthetic: Holding register temperature",
    });
    const report = buildEvidence(analysis, "2026-10-05T12:00:00.000Z");
    expect(report.generatedAt).toBe("2026-10-05T12:00:00.000Z");
    expect(report.captureTime).toBe("2020-01-01T00:00:00Z");
    expect(report.provenance.verified).toBe(false);
    expect(report.provenance.syntheticPreset?.id).toBe("holding-temperature");
    expect(report.provenance.statement).toContain("not a chain of custody");
    expect(report.versions).toEqual({ app: "0.1.0", decoder: "1.0.0", mapper: "1.0.0" });
    expect(report.map?.name).toBe("Synthetic teaching map");
    expect(report.map?.appliedEntries[0]).toMatchObject({ address: 100, wordIndex: 0 });
    expect(report.values[0]?.engineering?.formula).toBe("253 × 0.1 + 0");
    expect(report.request?.direction).toBe("request");
    expect(report.request?.originalText).toBe(HOLDING_TEMP_REQUEST);
    expect(report.request?.normalizedHex).toContain("00 64");
    const json = evidenceJson(report);
    expect(json).toContain("\"generatedAt\": \"2026-10-05T12:00:00.000Z\"");
    expect(json).toContain("\"captureTime\": \"2020-01-01T00:00:00Z\"");
    const markdown = renderMarkdown(report);
    expect(markdown).toContain("Generated at: 2026-10-05T12:00:00.000Z");
    expect(markdown).toContain("Capture time (user-supplied, unverified): 2020-01-01T00:00:00Z");
    expect(markdown).toContain("25.3");
    expect(markdown).toContain("not a chain of custody");
    expect(markdown).toContain("Synthetic: Holding register temperature");
  });

  it("escapes hostile map text in Markdown", () => {
    const hostile = "<script>alert(1)</script>";
    const map = {
      schemaVersion: 1,
      name: hostile,
      mapVersion: "1.0.0",
      source: "Invented demonstration data; no real equipment",
      entries: [
        {
          unitId: 1,
          functionCode: 3,
          address: 100,
          label: hostile,
          displayAddress: "40101",
          type: "uint16",
          scale: 0.1,
          offset: 0,
          unit: "°C",
        },
      ],
    };
    const analysis = analyzeExchange({
      requestText: HOLDING_TEMP_REQUEST,
      responseText: HOLDING_TEMP_RESPONSE,
      mapText: JSON.stringify(map),
      captureTime: "",
      provenanceNote: "",
      syntheticPresetId: null,
      syntheticPresetLabel: null,
    });
    const markdown = renderMarkdown(buildEvidence(analysis, "2026-10-05T12:00:00.000Z"));
    expect(markdown).not.toContain("<script>");
    expect(markdown).toContain(escapeMarkdownText(hostile));
    expect(markdown).toContain("&lt;script&gt;");
  });
});
