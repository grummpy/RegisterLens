import { EXCEPTION_RESPONSE, HOLDING_TEMP_REQUEST, HOLDING_TEMP_RESPONSE } from "../examples";
import type { RegisterMap } from "../map/types";
import { buildExceptionResponse, buildReadRequest, buildReadResponse } from "./frames";

export interface ExpectedWord {
  unsigned: number;
  address: number;
  typed?: number;
  engineering?: number;
  unit?: string | null;
}

export interface ValidFixture {
  id: string;
  category: string;
  functionCode: 3 | 4;
  requestHex: string;
  responseHex: string;
  map: RegisterMap | null;
  expect: {
    responseStatus: "valid" | "exception";
    pairing: "matched" | "matched_exception";
    transactionId: number;
    unitId: number;
    start?: number;
    quantity?: number;
    words?: ExpectedWord[];
    registerCount?: number;
    firstWord?: ExpectedWord;
    lastWord?: ExpectedWord;
    exceptionCode?: number;
    exceptionKnown?: boolean;
  };
}

export interface MalformedFixture {
  id: string;
  category: string;
  role: "request" | "response";
  hex: string;
  codes: string[];
}

function mapFor(
  functionCode: 3 | 4,
  address: number,
  type: "uint16" | "int16",
  scale: number,
  offset: number,
  unit: string | null,
): RegisterMap {
  return {
    schemaVersion: 1,
    name: "Synthetic fixture map",
    mapVersion: "1.0.0",
    source: "Invented demonstration data; no real equipment",
    entries: [
      {
        unitId: 1,
        functionCode,
        address,
        label: "Fixture point",
        displayAddress: null,
        type,
        scale,
        offset,
        unit,
      },
    ],
  };
}

function readPair(
  id: string,
  category: string,
  functionCode: 3 | 4,
  transactionId: number,
  address: number,
  words: number[],
  map: RegisterMap | null,
  expectedWords: ExpectedWord[],
): ValidFixture {
  return {
    id,
    category,
    functionCode,
    requestHex: buildReadRequest({
      transactionId,
      unitId: 1,
      functionCode,
      address,
      quantity: words.length,
    }),
    responseHex: buildReadResponse({
      transactionId,
      unitId: 1,
      functionCode,
      words,
    }),
    map,
    expect: {
      responseStatus: "valid",
      pairing: "matched",
      transactionId,
      unitId: 1,
      start: address,
      quantity: words.length,
      words: expectedWords,
    },
  };
}

const quantity125 = Array.from({ length: 125 }, (_, index) => index);

function functionFixtures(functionCode: 3 | 4, exceptionCode: 0x83 | 0x84): ValidFixture[] {
  const prefix = functionCode === 3 ? "fc03" : "fc04";
  const base = functionCode === 3 ? 0x20 : 0x40;
  return [
    readPair(`${prefix}-quantity-1`, "quantity 1", functionCode, base + 1, 100, [1], null, [
      { unsigned: 1, address: 100 },
    ]),
    {
      id: `${prefix}-quantity-125`,
      category: "quantity 125",
      functionCode,
      requestHex: buildReadRequest({
        transactionId: base + 2,
        unitId: 1,
        functionCode,
        address: 0,
        quantity: 125,
      }),
      responseHex: buildReadResponse({
        transactionId: base + 2,
        unitId: 1,
        functionCode,
        words: quantity125,
      }),
      map: null,
      expect: {
        responseStatus: "valid",
        pairing: "matched",
        transactionId: base + 2,
        unitId: 1,
        start: 0,
        quantity: 125,
        registerCount: 125,
        firstWord: { unsigned: 0, address: 0 },
        lastWord: { unsigned: 124, address: 124 },
      },
    },
    readPair(`${prefix}-start-0`, "start 0", functionCode, base + 3, 0, [1, 2, 3], null, [
      { unsigned: 1, address: 0 },
      { unsigned: 2, address: 1 },
      { unsigned: 3, address: 2 },
    ]),
    readPair(`${prefix}-start-65535`, "start 65535 quantity 1", functionCode, base + 4, 65535, [7], null, [
      { unsigned: 7, address: 65535 },
    ]),
    readPair(`${prefix}-raw-0`, "raw 0", functionCode, base + 5, 50, [0], null, [{ unsigned: 0, address: 50 }]),
    readPair(`${prefix}-raw-65535`, "raw 65535", functionCode, base + 6, 51, [65535], null, [
      { unsigned: 65535, address: 51 },
    ]),
    readPair(
      `${prefix}-signed-min`,
      "signed -32768",
      functionCode,
      base + 7,
      200,
      [0x8000],
      mapFor(functionCode, 200, "int16", 1, 0, "counts"),
      [{ unsigned: 32768, address: 200, typed: -32768, engineering: -32768, unit: "counts" }],
    ),
    readPair(
      `${prefix}-signed-max`,
      "signed 32767",
      functionCode,
      base + 8,
      201,
      [0x7fff],
      mapFor(functionCode, 201, "int16", 1, 0, "counts"),
      [{ unsigned: 32767, address: 201, typed: 32767, engineering: 32767, unit: "counts" }],
    ),
    readPair(
      `${prefix}-fractional-scale`,
      "explicit fractional scaling",
      functionCode,
      base + 9,
      100,
      [253],
      mapFor(functionCode, 100, "uint16", 0.1, 0, "°C"),
      [{ unsigned: 253, address: 100, typed: 253, engineering: 253 * 0.1, unit: "°C" }],
    ),
    {
      id: `${prefix}-paired-exception`,
      category: "paired exception",
      functionCode,
      requestHex: buildReadRequest({
        transactionId: base + 10,
        unitId: 1,
        functionCode,
        address: 100,
        quantity: 1,
      }),
      responseHex: buildExceptionResponse({
        transactionId: base + 10,
        unitId: 1,
        functionCode: exceptionCode,
        code: functionCode === 3 ? 2 : 3,
      }),
      map: mapFor(functionCode, 100, "uint16", 0.1, 0, "°C"),
      expect: {
        responseStatus: "exception",
        pairing: "matched_exception",
        transactionId: base + 10,
        unitId: 1,
        start: 100,
        quantity: 1,
        exceptionCode: functionCode === 3 ? 2 : 3,
        exceptionKnown: true,
      },
    },
  ];
}

export const validFixtures: readonly ValidFixture[] = [...functionFixtures(3, 0x83), ...functionFixtures(4, 0x84)];

export const specExamples = {
  holdingRequest: HOLDING_TEMP_REQUEST,
  holdingResponse: HOLDING_TEMP_RESPONSE,
  exceptionResponse: EXCEPTION_RESPONSE,
};

export const malformedFixtures: readonly MalformedFixture[] = [
  { id: "invalid-hex", category: "invalid hex", role: "request", hex: "00 GG", codes: ["HEX_INVALID_CHAR"] },
  { id: "odd-digits", category: "odd digits", role: "request", hex: "00 1", codes: ["HEX_ODD_DIGITS"] },
  { id: "short-mbap", category: "short MBAP", role: "request", hex: "00 01 00 00", codes: ["MBAP_TOO_SHORT"] },
  {
    id: "wrong-protocol-id",
    category: "wrong protocol ID",
    role: "request",
    hex: "00 01 00 01 00 06 01 03 00 64 00 01",
    codes: ["PROTOCOL_ID_NONZERO"],
  },
  {
    id: "inconsistent-length",
    category: "inconsistent length",
    role: "request",
    hex: "00 01 00 00 00 06 01 03 00 64",
    codes: ["LENGTH_INCONSISTENT", "ADU_INCOMPLETE"],
  },
  {
    id: "trailing-concatenated",
    category: "trailing or concatenated bytes",
    role: "request",
    hex: "00 01 00 00 00 06 01 03 00 64 00 01 00 01 00 00 00 06 01 03 00 64 00 01",
    codes: ["LENGTH_INCONSISTENT", "ADU_TRAILING"],
  },
  { id: "short-pdu", category: "short PDU", role: "request", hex: "00 01 00 00 00 03 01 03 00", codes: ["PDU_TOO_SHORT"] },
  {
    id: "quantity-0",
    category: "quantity 0",
    role: "request",
    hex: "00 01 00 00 00 06 01 03 00 64 00 00",
    codes: ["QUANTITY_OUT_OF_RANGE"],
  },
  {
    id: "quantity-126",
    category: "quantity 126",
    role: "request",
    hex: "00 01 00 00 00 06 01 03 00 00 00 7E",
    codes: ["QUANTITY_OUT_OF_RANGE"],
  },
  {
    id: "address-overflow",
    category: "address overflow",
    role: "request",
    hex: "00 01 00 00 00 06 01 03 FF FF 00 02",
    codes: ["ADDRESS_OVERFLOW"],
  },
  {
    id: "odd-byte-count",
    category: "odd byte count",
    role: "response",
    hex: "00 01 00 00 00 06 01 03 03 AA BB CC",
    codes: ["BYTE_COUNT_ODD"],
  },
  {
    id: "count-data-mismatch",
    category: "count/data mismatch",
    role: "response",
    hex: "00 01 00 00 00 07 01 03 02 00 FD 11 22",
    codes: ["BYTE_COUNT_DATA_MISMATCH"],
  },
];
