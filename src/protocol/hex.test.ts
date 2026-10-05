import { describe, expect, it } from "vitest";
import { parseHex } from "./hex";

describe("parseHex", () => {
  it("normalizes case and ASCII whitespace", () => {
    const parsed = parseHex("  00\n01\t00 00 00 06 01 03 00 64 00 01\r");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.normalizedHex).toBe("00 01 00 00 00 06 01 03 00 64 00 01");
      expect(parsed.bytes).toHaveLength(12);
    }
  });

  it("accepts lowercase hex", () => {
    const parsed = parseHex("aa bb");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bytes).toEqual([0xaa, 0xbb]);
    }
  });

  it("treats whitespace-only input as no bytes", () => {
    const parsed = parseHex(" \n\t");
    expect(parsed).toEqual({ ok: true, bytes: [], normalizedHex: "" });
  });

  it("reports an invalid character with its index", () => {
    const parsed = parseHex("00 GG");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics[0]?.code).toBe("HEX_INVALID_CHAR");
      expect(parsed.diagnostics[0]?.index).toBe(3);
    }
  });

  it("reports an odd digit with its index", () => {
    const parsed = parseHex("00 1");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics[0]?.code).toBe("HEX_ODD_DIGITS");
      expect(parsed.diagnostics[0]?.index).toBe(3);
    }
  });

  it("rejects text over 8 KiB before parsing digits", () => {
    const parsed = parseHex("Z".repeat(8193));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics.map((item) => item.code)).toEqual(["HEX_TOO_LARGE"]);
    }
  });

  it("accepts 8 KiB of hex text and then enforces the 260 byte ADU limit", () => {
    const parsed = parseHex("0".repeat(8192));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics[0]?.code).toBe("ADU_TOO_LONG");
    }
  });
});
