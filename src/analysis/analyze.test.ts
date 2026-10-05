import { describe, expect, it } from "vitest";
import {
  EXCEPTION_RESPONSE,
  HOLDING_TEMP_REQUEST,
  HOLDING_TEMP_RESPONSE,
  INPUT_SIGNED_REQUEST,
  INPUT_SIGNED_RESPONSE,
  SIGNED_INPUT_MAP_JSON,
  TEACHING_MAP_JSON,
} from "../examples";
import { buildExceptionResponse, buildReadRequest, buildReadResponse } from "../fixtures/frames";
import { analyzeExchange, type AnalyzeInput } from "./analyze";

function input(partial: Partial<AnalyzeInput> = {}): AnalyzeInput {
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

describe("worked examples", () => {
  it("turns 00 FD into 253 and then 25.3 °C only through the explicit map", () => {
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: HOLDING_TEMP_RESPONSE,
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(result.pairing.status).toBe("matched");
    expect(result.registers[0]).toMatchObject({
      address: 100,
      addressHex: "0x0064",
      rawUnsigned: 253,
      rawHex: "00 FD",
      displayAddress: "40101",
      unit: "°C",
      meaning: "explicit",
    });
    expect(result.registers[0]?.engineering?.display).toBe("25.3");
    expect(result.registers[0]?.engineering?.value).toBe(253 * 0.1);
    expect(result.registers[0]?.engineering?.formula).toBe("253 × 0.1 + 0");
    expect(result.explanations.join(" ")).toContain("6 + 6 = 12");
    expect(result.explanations.join(" ")).toContain("6 + 5 = 11");
    expect(result.explanations.join(" ")).toContain("only because the map");
  });

  it("decodes the signed input-register example", () => {
    const result = analyzeExchange(
      input({
        requestText: INPUT_SIGNED_REQUEST,
        responseText: INPUT_SIGNED_RESPONSE,
        mapText: SIGNED_INPUT_MAP_JSON,
      }),
    );
    expect(result.pairing.status).toBe("matched");
    expect(result.registers[0]).toMatchObject({
      address: 0,
      rawUnsigned: 65436,
      typed: { type: "int16", value: -100 },
      unit: "°C",
    });
    expect(result.registers[0]?.engineering?.display).toBe("-10");
    expect(result.registers[1]).toMatchObject({
      address: 1,
      rawUnsigned: 200,
      typed: { type: "uint16", value: 200 },
      unit: null,
      unitStatement: "unit unknown",
    });
    expect(result.registers[1]?.engineering?.value).toBe(200);
  });

  it("treats exception 02 as a device report, not a malformed frame", () => {
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: EXCEPTION_RESPONSE,
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(result.response?.status).toBe("exception");
    expect(result.response?.exceptionCode).toBe(2);
    expect(result.response?.exceptionName).toBe("Illegal Data Address");
    expect(result.pairing.status).toBe("matched_exception");
    expect(result.registers).toEqual([]);
    expect(result.explanations.join(" ")).toContain("does not infer the root cause");
  });
});

describe("exchange rules", () => {
  it("preserves an unknown exception code without inventing a meaning", () => {
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: "00 01 00 00 00 03 01 83 2A",
      }),
    );
    expect(result.response?.status).toBe("exception");
    expect(result.response?.exceptionKnown).toBe(false);
    expect(result.response?.exceptionName).toBeNull();
    expect(result.response?.diagnostics.some((item) => item.code === "EXCEPTION_CODE_UNKNOWN")).toBe(true);
    expect(result.registers).toEqual([]);
  });

  it("shows an unsupported function as an envelope plus raw PDU", () => {
    const result = analyzeExchange(
      input({ requestText: "00 01 00 00 00 06 01 06 00 01 00 03" }),
    );
    expect(result.request?.status).toBe("unsupported");
    expect(result.request?.fields.some((field) => field.name === "Raw PDU")).toBe(true);
    expect(result.registers).toEqual([]);
    expect(result.request?.startingAddress).toBeNull();
  });

  it("does not treat an exception pasted in the request box as a response", () => {
    const decoded = analyzeExchange(input({ requestText: EXCEPTION_RESPONSE }));
    expect(decoded.request?.status).toBe("unsupported");
    expect(decoded.request?.status).not.toBe("exception");
  });

  it("leaves addresses unknown when the transaction IDs differ", () => {
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: "00 63 00 00 00 05 01 03 02 00 FD",
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(result.pairing.status).toBe("unmatched");
    expect(result.pairing.diagnostics.some((item) => item.code === "PAIR_TRANSACTION_MISMATCH")).toBe(true);
    expect(result.registers[0]?.rawUnsigned).toBe(253);
    expect(result.registers[0]?.address).toBeNull();
    expect(result.registers[0]?.engineering).toBeNull();
    expect(result.registers[0]?.meaning).toBe("unknown");
  });

  it("reports unit and function mismatches separately", () => {
    const unit = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: "00 01 00 00 00 05 02 03 02 00 FD",
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(unit.pairing.diagnostics.some((item) => item.code === "PAIR_UNIT_MISMATCH")).toBe(true);
    expect(unit.registers[0]?.engineering).toBeNull();

    const fn = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: buildReadResponse({ transactionId: 1, unitId: 1, functionCode: 4, words: [0xfd] }),
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(fn.pairing.diagnostics.some((item) => item.code === "PAIR_FUNCTION_MISMATCH")).toBe(true);
    expect(fn.registers[0]?.address).toBeNull();
  });

  it("rejects a paired response whose byte count disagrees with quantity", () => {
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: buildReadResponse({ transactionId: 1, unitId: 1, functionCode: 3, words: [1, 2] }),
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(result.response?.status).toBe("valid");
    expect(result.pairing.diagnostics.some((item) => item.code === "PAIR_QUANTITY_MISMATCH")).toBe(true);
    expect(result.registers.every((register) => register.address === null && register.engineering === null)).toBe(true);
  });

  it("marks a response without a request as an orphan", () => {
    const result = analyzeExchange(input({ responseText: HOLDING_TEMP_RESPONSE, mapText: TEACHING_MAP_JSON }));
    expect(result.pairing.status).toBe("orphan_response");
    expect(result.registers[0]?.address).toBeNull();
    expect(result.registers[0]?.rawUnsigned).toBe(253);
    expect(result.registers[0]?.engineering).toBeNull();
  });

  it("accepts unit ID 0 and unit ID 255 on TCP", () => {
    for (const unitId of [0, 255]) {
      const result = analyzeExchange(
        input({
          requestText: buildReadRequest({ transactionId: 7, unitId, functionCode: 3, address: 1, quantity: 1 }),
          responseText: buildReadResponse({ transactionId: 7, unitId, functionCode: 3, words: [4] }),
        }),
      );
      expect(result.pairing.status).toBe("matched");
      expect(result.request?.mbap?.unitId).toBe(unitId);
    }
  });

  it("does not reuse a previous result object when decoding again", () => {
    const first = analyzeExchange(
      input({ requestText: HOLDING_TEMP_REQUEST, responseText: HOLDING_TEMP_RESPONSE, mapText: TEACHING_MAP_JSON }),
    );
    const second = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: "00 01 00 00 00 05 01 03 02 00 0A",
        mapText: TEACHING_MAP_JSON,
      }),
    );
    expect(first.registers[0]?.engineering?.display).toBe("25.3");
    expect(second.registers[0]?.rawUnsigned).toBe(10);
    expect(second.registers[0]?.engineering?.display).toBe("1");
    expect(first.registers[0]?.engineering?.display).toBe("25.3");
  });

  it("keeps a null-metadata entry from inventing an engineering value", () => {
    const map = {
      schemaVersion: 1,
      name: "Synthetic null metadata",
      mapVersion: "1.0.0",
      source: "Invented demonstration data; no real equipment",
      entries: [
        {
          unitId: 1,
          functionCode: 3,
          address: 100,
          label: "Documented only",
          type: null,
          scale: null,
          offset: null,
          unit: null,
        },
      ],
    };
    const result = analyzeExchange(
      input({
        requestText: HOLDING_TEMP_REQUEST,
        responseText: HOLDING_TEMP_RESPONSE,
        mapText: JSON.stringify(map),
      }),
    );
    expect(result.map.status).toBe("valid");
    expect(result.registers[0]?.rawUnsigned).toBe(253);
    expect(result.registers[0]?.engineering).toBeNull();
    expect(result.registers[0]?.typed).toBeNull();
    expect(result.registers[0]?.unknowns.join(" ")).toContain("type is null");
    expect(result.registers[0]?.unknowns.join(" ")).toContain("scale is null");
    expect(result.registers[0]?.unknowns.join(" ")).toContain("unit is null");
    expect(result.registers[0]?.documentationLabel).toBe("Documented only");
  });

  it("builds an exception with function 84", () => {
    const result = analyzeExchange(
      input({
        requestText: buildReadRequest({ transactionId: 2, unitId: 1, functionCode: 4, address: 0, quantity: 2 }),
        responseText: buildExceptionResponse({ transactionId: 2, unitId: 1, functionCode: 0x84, code: 2 }),
      }),
    );
    expect(result.pairing.status).toBe("matched_exception");
    expect(result.response?.status).toBe("exception");
  });
});
