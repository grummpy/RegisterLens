import { describe, expect, it } from "vitest";
import { analyzeExchange, type AnalyzeInput } from "../analysis/analyze";
import { HOLDING_TEMP_REQUEST, HOLDING_TEMP_RESPONSE, INPUT_SIGNED_RESPONSE } from "../examples";
import { mapToJson } from "../map/template";
import { decodeMessage } from "./decodeMessage";
import { malformedFixtures, validFixtures } from "../fixtures/catalog";
import { buildReadRequest, buildReadResponse } from "../fixtures/frames";

function input(partial: Partial<AnalyzeInput>): AnalyzeInput {
  return {
    requestText: "",
    responseText: "",
    mapText: "",
    captureTime: "",
    provenanceNote: "",
    syntheticPresetId: null,
    syntheticPresetLabel: null,
    ...partial,
  };
}

describe("frame builder", () => {
  it("reproduces the documented holding-register example", () => {
    expect(
      buildReadRequest({ transactionId: 1, unitId: 1, functionCode: 3, address: 100, quantity: 1 }),
    ).toBe(HOLDING_TEMP_REQUEST);
    expect(buildReadResponse({ transactionId: 1, unitId: 1, functionCode: 3, words: [0x00fd] })).toBe(
      HOLDING_TEMP_RESPONSE,
    );
    expect(HOLDING_TEMP_REQUEST.split(" ")).toHaveLength(12);
    expect(HOLDING_TEMP_RESPONSE.split(" ")).toHaveLength(11);
    expect(INPUT_SIGNED_RESPONSE.split(" ")).toHaveLength(13);
  });
});

describe("valid fixtures", () => {
  it("keeps at least 20 distinct valid fixtures, ten for each function", () => {
    expect(validFixtures.length).toBeGreaterThanOrEqual(20);
    expect(validFixtures.filter((fixture) => fixture.functionCode === 3)).toHaveLength(10);
    expect(validFixtures.filter((fixture) => fixture.functionCode === 4)).toHaveLength(10);
    expect(new Set(validFixtures.map((fixture) => fixture.id)).size).toBe(validFixtures.length);
  });

  it.each(validFixtures.map((fixture) => [fixture.id, fixture] as const))("%s", (_id, fixture) => {
    const result = analyzeExchange(
      input({
        requestText: fixture.requestHex,
        responseText: fixture.responseHex,
        mapText: fixture.map ? mapToJson(fixture.map) : "",
      }),
    );
    expect(result.request?.status).toBe("valid");
    expect(result.response?.status).toBe(fixture.expect.responseStatus);
    expect(result.response?.status).not.toBe("malformed");
    expect(result.pairing.status).toBe(fixture.expect.pairing);
    expect(result.request?.mbap?.transactionId).toBe(fixture.expect.transactionId);
    expect(result.request?.mbap?.unitId).toBe(fixture.expect.unitId);
    expect(result.request?.startingAddress).toBe(fixture.expect.start);
    expect(result.request?.quantity).toBe(fixture.expect.quantity);
    if (fixture.expect.exceptionCode !== undefined) {
      expect(result.registers).toEqual([]);
      expect(result.response?.exceptionCode).toBe(fixture.expect.exceptionCode);
      expect(result.response?.exceptionKnown).toBe(fixture.expect.exceptionKnown);
      expect(result.registers.some((register) => register.engineering)).toBe(false);
    }
    if (fixture.expect.words) {
      expect(result.registers).toHaveLength(fixture.expect.words.length);
      fixture.expect.words.forEach((word, index) => {
        const register = result.registers[index];
        expect(register?.rawUnsigned).toBe(word.unsigned);
        expect(register?.address).toBe(word.address);
        if (word.typed !== undefined) {
          expect(register?.typed?.value).toBe(word.typed);
        }
        if (word.engineering !== undefined) {
          expect(register?.engineering?.value).toBe(word.engineering);
        }
        if (word.unit !== undefined) {
          expect(register?.unit).toBe(word.unit);
        }
      });
    }
    if (fixture.expect.registerCount !== undefined) {
      expect(result.registers).toHaveLength(fixture.expect.registerCount);
      expect(result.registers[0]).toMatchObject({
        rawUnsigned: fixture.expect.firstWord?.unsigned,
        address: fixture.expect.firstWord?.address,
      });
      const last = result.registers[result.registers.length - 1];
      expect(last).toMatchObject({
        rawUnsigned: fixture.expect.lastWord?.unsigned,
        address: fixture.expect.lastWord?.address,
      });
    }
  });
});

describe("malformed fixtures", () => {
  it("covers at least 10 malformed cases", () => {
    expect(malformedFixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(malformedFixtures.map((fixture) => [fixture.id, fixture] as const))("%s", (_id, fixture) => {
    const decoded = decodeMessage(fixture.role, fixture.hex);
    expect(decoded?.status).toBe("malformed");
    expect(decoded?.status).not.toBe("exception");
    expect(decoded?.status).not.toBe("unsupported");
    const codes = decoded?.diagnostics.map((item) => item.code) ?? [];
    for (const code of fixture.codes) {
      expect(codes).toContain(code);
    }
    const result = analyzeExchange(
      input(
        fixture.role === "request"
          ? { requestText: fixture.hex, responseText: "" }
          : { requestText: "", responseText: fixture.hex },
      ),
    );
    expect(result.registers.every((register) => register.engineering === null)).toBe(true);
    expect(result.registers.every((register) => register.address === null)).toBe(true);
  });
});
