import { describe, expect, it } from "vitest";
import { teachingMap } from "./template";
import { validateMapText } from "./validateMap";

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    unitId: 1,
    functionCode: 3,
    address: 100,
    label: "Demo temperature",
    displayAddress: "40101",
    type: "uint16",
    scale: 0.1,
    offset: 0,
    unit: "°C",
    ...overrides,
  };
}

function mapWith(entries: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    name: "Synthetic teaching map",
    mapVersion: "1.0.0",
    source: "Invented demonstration data; no real equipment",
    entries,
    ...extra,
  });
}

describe("validateMapText", () => {
  it("accepts the teaching map", () => {
    const result = validateMapText(JSON.stringify(teachingMap));
    expect(result.status).toBe("valid");
    expect(result.map?.entries).toHaveLength(1);
  });

  it("treats empty text as no map", () => {
    expect(validateMapText("  ").status).toBe("absent");
  });

  it("rejects an unsupported schema version", () => {
    const result = validateMapText(JSON.stringify({ ...teachingMap, schemaVersion: 2 }));
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.some((item) => item.path === "$.schemaVersion")).toBe(true);
  });

  it("rejects unknown fields with a JSON path", () => {
    const result = validateMapText(mapWith([baseEntry({ byteOrder: "le" })]));
    expect(result.diagnostics.some((item) => item.path === "$.entries[0].byteOrder")).toBe(true);
  });

  it("rejects duplicate selectors", () => {
    const result = validateMapText(mapWith([baseEntry(), baseEntry({ label: "again" })]));
    expect(result.diagnostics.some((item) => item.code === "MAP_DUPLICATE")).toBe(true);
    expect(result.map).toBeNull();
  });

  it("rejects a float type", () => {
    const result = validateMapText(mapWith([baseEntry({ type: "float32" })]));
    expect(result.diagnostics.some((item) => item.path === "$.entries[0].type")).toBe(true);
  });

  it("rejects a string scale and function code 6", () => {
    const scale = validateMapText(mapWith([baseEntry({ scale: "0.1" })]));
    expect(scale.diagnostics.some((item) => item.path === "$.entries[0].scale")).toBe(true);
    const fn = validateMapText(mapWith([baseEntry({ functionCode: 6 })]));
    expect(fn.diagnostics.some((item) => item.path === "$.entries[0].functionCode")).toBe(true);
  });

  it("rejects labels, units, and names that exceed the character limits", () => {
    expect(validateMapText(mapWith([baseEntry({ label: "x".repeat(81) })])).diagnostics[0]?.path).toBe(
      "$.entries[0].label",
    );
    expect(validateMapText(mapWith([baseEntry({ unit: "u".repeat(33) })])).diagnostics[0]?.path).toBe(
      "$.entries[0].unit",
    );
    const named = validateMapText(
      JSON.stringify({ ...teachingMap, name: "n".repeat(257) }),
    );
    expect(named.diagnostics.some((item) => item.path === "$.name")).toBe(true);
  });

  it("keeps hostile text as inert data when it fits the limits", () => {
    const result = validateMapText(mapWith([baseEntry({ label: "<script>alert(1)</script>" })]));
    expect(result.status).toBe("valid");
    expect(result.map?.entries[0]?.label).toBe("<script>alert(1)</script>");
  });

  it("stops on an oversized document before JSON parsing", () => {
    const result = validateMapText(`{${" ".repeat(256 * 1024)}`);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["MAP_TOO_LARGE"]);
  });

  it("rejects more than 1000 entries before interpreting them", () => {
    const entries = Array.from({ length: 1001 }, (_, index) => baseEntry({ address: index, label: undefined }));
    const result = validateMapText(mapWith(entries));
    expect(result.diagnostics.some((item) => item.code === "MAP_ENTRY_LIMIT")).toBe(true);
    expect(result.map).toBeNull();
  });

  it("reports invalid JSON", () => {
    const result = validateMapText("{");
    expect(result.diagnostics[0]?.code).toBe("MAP_JSON_INVALID");
  });
});
