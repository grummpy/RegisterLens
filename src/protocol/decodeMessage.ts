import {
  baseFunction,
  exceptionName,
  formatBytes,
  functionLabel,
  readU16,
  toHexByte,
  toHexWord,
} from "./bytes";
import { diagnostic, type Diagnostic } from "./diagnostics";
import {
  explainAddress,
  explainByteCount,
  explainException,
  explainFunction,
  explainLength,
  explainProtocolId,
  explainQuantity,
  explainRawWord,
  explainTransactionId,
  explainUnitId,
  explainUnsupported,
} from "../explain/explain";
import { parseHex } from "./hex";
import {
  MAX_ADU_BYTES,
  MAX_BYTE_COUNT,
  MAX_MBAP_LENGTH,
  MAX_QUANTITY,
  MIN_BYTE_COUNT,
  MIN_MBAP_LENGTH,
  MIN_QUANTITY,
} from "./limits";
import type { DecodedField, MbapView, MessageDecode, MessageRole, MessageStatus } from "./types";

function emptyDecode(role: MessageRole, originalText: string): MessageDecode {
  return {
    role,
    status: "malformed",
    originalText,
    normalizedHex: null,
    bytes: [],
    diagnostics: [],
    mbap: null,
    functionCode: null,
    baseFunction: null,
    startingAddress: null,
    quantity: null,
    byteCount: null,
    words: null,
    exceptionCode: null,
    exceptionName: null,
    exceptionKnown: false,
    fields: [],
  };
}

function field(
  role: MessageRole,
  id: string,
  name: string,
  bytes: readonly number[],
  byteStart: number,
  byteEnd: number,
  parsedValue: string,
  explanation: string,
  kind: DecodedField["kind"],
): DecodedField {
  return {
    id: `${role}-${id}`,
    name,
    byteStart,
    byteEnd,
    rawHex: formatBytes(bytes.slice(byteStart, byteEnd + 1)),
    parsedValue,
    explanation,
    kind,
  };
}

function mbapFields(role: MessageRole, bytes: readonly number[], mbap: MbapView): DecodedField[] {
  return [
    field(
      role,
      "transaction-id",
      "Transaction ID",
      bytes,
      0,
      1,
      `${mbap.transactionId} (0x${toHexWord(mbap.transactionId)})`,
      explainTransactionId(mbap.transactionId),
      "mbap",
    ),
    field(
      role,
      "protocol-id",
      "Protocol ID",
      bytes,
      2,
      3,
      `${mbap.protocolId} (0x${toHexWord(mbap.protocolId)})`,
      explainProtocolId(mbap.protocolId),
      "mbap",
    ),
    field(
      role,
      "length",
      "Length",
      bytes,
      4,
      5,
      `${mbap.length} (0x${toHexWord(mbap.length)})`,
      explainLength(mbap.length),
      "mbap",
    ),
    field(
      role,
      "unit-id",
      "Unit ID",
      bytes,
      6,
      6,
      `${mbap.unitId} (0x${toHexByte(mbap.unitId)})`,
      explainUnitId(mbap.unitId),
      "mbap",
    ),
  ];
}

function finish(
  role: MessageRole,
  originalText: string,
  normalizedHex: string,
  bytes: number[],
  status: MessageStatus,
  diagnostics: Diagnostic[],
  mbap: MbapView | null,
  fields: DecodedField[],
  extra?: Partial<MessageDecode>,
): MessageDecode {
  return {
    ...emptyDecode(role, originalText),
    status,
    normalizedHex,
    bytes,
    diagnostics,
    mbap,
    fields,
    ...extra,
  };
}

export function decodeMessage(role: MessageRole, originalText: string): MessageDecode | null {
  if (originalText.trim() === "") {
    return null;
  }
  const parsed = parseHex(originalText);
  if (!parsed.ok) {
    return finish(role, originalText, "", [], "malformed", parsed.diagnostics, null, []);
  }
  if (parsed.bytes.length === 0) {
    return null;
  }
  return decodeBytes(role, originalText, parsed.normalizedHex, parsed.bytes);
}

function decodeBytes(
  role: MessageRole,
  originalText: string,
  normalizedHex: string,
  bytes: number[],
): MessageDecode {
  const diagnostics: Diagnostic[] = [];
  if (bytes.length < 7) {
    diagnostics.push(
      diagnostic(
        "MBAP_TOO_SHORT",
        "error",
        `A Modbus TCP MBAP header is 7 bytes (transaction ID, protocol ID, length, and unit ID). This input has ${bytes.length} byte${bytes.length === 1 ? "" : "s"}.`,
        { byteRange: { start: 0, end: Math.max(0, bytes.length - 1) } },
      ),
    );
    if (bytes.length >= 6) {
      const length = readU16(bytes, 4);
      if (length !== null) {
        pushLengthDiagnostics(diagnostics, length, bytes.length);
      }
    }
    return finish(role, originalText, normalizedHex, bytes, "malformed", diagnostics, null, []);
  }

  const transactionId = readU16(bytes, 0);
  const protocolId = readU16(bytes, 2);
  const length = readU16(bytes, 4);
  const unitId = bytes[6];
  if (transactionId === null || protocolId === null || length === null || unitId === undefined) {
    diagnostics.push(
      diagnostic("MBAP_TOO_SHORT", "error", "The MBAP header could not be read inside the validated buffer."),
    );
    return finish(role, originalText, normalizedHex, bytes, "malformed", diagnostics, null, []);
  }

  const mbap: MbapView = { transactionId, protocolId, length, unitId };
  pushLengthDiagnostics(diagnostics, length, bytes.length);
  if (protocolId !== 0) {
    diagnostics.push(
      diagnostic(
        "PROTOCOL_ID_NONZERO",
        "error",
        `Protocol ID is 0x${toHexWord(protocolId)} at bytes 2–3. Modbus TCP requires protocol ID 0. The PDU was not interpreted.`,
        { byteRange: { start: 2, end: 3 } },
      ),
    );
  }
  if (length < MIN_MBAP_LENGTH || length > MAX_MBAP_LENGTH || bytes.length !== 6 + length || protocolId !== 0) {
    return finish(role, originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, []);
  }

  const expectedTotal = 6 + length;
  if (expectedTotal > MAX_ADU_BYTES) {
    diagnostics.push(
      diagnostic(
        "ADU_TOO_LONG",
        "error",
        `Length ${length} implies ${expectedTotal} bytes, above the ${MAX_ADU_BYTES}-byte ADU maximum.`,
      ),
    );
    return finish(role, originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, []);
  }

  const pdu = bytes.slice(7);
  const functionCode = pdu[0];
  if (functionCode === undefined) {
    diagnostics.push(diagnostic("PDU_TOO_SHORT", "error", "The PDU is missing a function code.", { byteRange: { start: 7, end: 7 } }));
    return finish(role, originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, mbapFields(role, bytes, mbap));
  }

  if (role === "request") {
    return decodeRequest(originalText, normalizedHex, bytes, mbap, pdu, functionCode, diagnostics);
  }
  return decodeResponse(originalText, normalizedHex, bytes, mbap, pdu, functionCode, diagnostics);
}

function pushLengthDiagnostics(diagnostics: Diagnostic[], length: number, actual: number): void {
  if (length < MIN_MBAP_LENGTH || length > MAX_MBAP_LENGTH) {
    diagnostics.push(
      diagnostic(
        "LENGTH_OUT_OF_RANGE",
        "error",
        `Length field is ${length} at bytes 4–5. It must be from ${MIN_MBAP_LENGTH} through ${MAX_MBAP_LENGTH}, because it counts the unit ID plus the PDU and the ADU maximum is ${MAX_ADU_BYTES} bytes.`,
        { byteRange: { start: 4, end: 5 } },
      ),
    );
    return;
  }
  const expected = 6 + length;
  if (actual !== expected) {
    diagnostics.push(
      diagnostic(
        "LENGTH_INCONSISTENT",
        "error",
        `Length field is ${length}, so the application data unit must be exactly 6 + ${length} = ${expected} bytes. This input has ${actual} bytes.`,
        { byteRange: { start: 4, end: 5 } },
      ),
    );
    if (actual < expected) {
      diagnostics.push(
        diagnostic(
          "ADU_INCOMPLETE",
          "error",
          `The message is short by ${expected - actual} byte${expected - actual === 1 ? "" : "s"}. It was not padded or completed.`,
        ),
      );
    } else {
      diagnostics.push(
        diagnostic(
          "ADU_TRAILING",
          "error",
          `${actual - expected} byte${actual - expected === 1 ? "" : "s"} follow the application data unit described by the length field. Concatenated or trailing bytes are rejected instead of being truncated.`,
        ),
      );
    }
  }
}

function decodeRequest(
  originalText: string,
  normalizedHex: string,
  bytes: number[],
  mbap: MbapView,
  pdu: number[],
  functionCode: number,
  diagnostics: Diagnostic[],
): MessageDecode {
  const header = mbapFields("request", bytes, mbap);
  if (functionCode !== 3 && functionCode !== 4) {
    diagnostics.push(
      diagnostic(
        "FUNCTION_UNSUPPORTED",
        "info",
        explainUnsupported(functionCode),
        { byteRange: { start: 7, end: bytes.length - 1 } },
      ),
    );
    const fields = [
      ...header,
      field(
        "request",
        "function",
        "Function code",
        bytes,
        7,
        7,
        functionLabel(functionCode),
        explainFunction(functionCode, "request"),
        "pdu",
      ),
      field(
        "request",
        "raw-pdu",
        "Raw PDU",
        bytes,
        7,
        bytes.length - 1,
        formatBytes(pdu),
        explainUnsupported(functionCode),
        "pdu",
      ),
    ];
    return finish("request", originalText, normalizedHex, bytes, "unsupported", diagnostics, mbap, fields, {
      functionCode,
      baseFunction: baseFunction(functionCode),
    });
  }

  if (pdu.length < 5) {
    diagnostics.push(
      diagnostic(
        "PDU_TOO_SHORT",
        "error",
        `Function ${toHexByte(functionCode)} requests must have a 5-byte PDU (function, starting address, quantity). This PDU is ${pdu.length} byte${pdu.length === 1 ? "" : "s"}.`,
        { byteRange: { start: 7, end: bytes.length - 1 } },
      ),
    );
    return finish("request", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, [
      ...header,
      field(
        "request",
        "function",
        "Function code",
        bytes,
        7,
        7,
        functionLabel(functionCode),
        explainFunction(functionCode, "request"),
        "pdu",
      ),
    ], { functionCode, baseFunction: baseFunction(functionCode) });
  }

  if (pdu.length > 5) {
    diagnostics.push(
      diagnostic(
        "PDU_LENGTH",
        "error",
        `Function ${toHexByte(functionCode)} requests must be exactly 5 PDU bytes. This PDU is ${pdu.length} bytes.`,
        { byteRange: { start: 7, end: bytes.length - 1 } },
      ),
    );
    return finish("request", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
      functionCode,
      baseFunction: baseFunction(functionCode),
    });
  }

  const startingAddress = readU16(pdu, 1);
  const quantity = readU16(pdu, 3);
  if (startingAddress === null || quantity === null) {
    diagnostics.push(diagnostic("PDU_TOO_SHORT", "error", "Starting address and quantity could not be read."));
    return finish("request", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
      functionCode,
      baseFunction: baseFunction(functionCode),
    });
  }

  if (quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    diagnostics.push(
      diagnostic(
        "QUANTITY_OUT_OF_RANGE",
        "error",
        `Quantity is ${quantity} at bytes 10–11. Function 03/04 quantity must be from ${MIN_QUANTITY} through ${MAX_QUANTITY}.`,
        { byteRange: { start: 10, end: 11 } },
      ),
    );
  } else if (startingAddress > 65535 - (quantity - 1)) {
    diagnostics.push(
      diagnostic(
        "ADDRESS_OVERFLOW",
        "error",
        `Starting address ${startingAddress} plus quantity ${quantity} minus 1 is ${startingAddress + quantity - 1}, which is above 65535.`,
        { byteRange: { start: 8, end: 11 } },
      ),
    );
  }

  const fields = [
    ...header,
    field(
      "request",
      "function",
      "Function code",
      bytes,
      7,
      7,
      functionLabel(functionCode),
      explainFunction(functionCode, "request"),
      "pdu",
    ),
    field(
      "request",
      "address",
      "Starting address",
      bytes,
      8,
      9,
      `${startingAddress} (0x${toHexWord(startingAddress)})`,
      explainAddress(startingAddress),
      "pdu",
    ),
    field(
      "request",
      "quantity",
      "Quantity",
      bytes,
      10,
      11,
      `${quantity} (0x${toHexWord(quantity)})`,
      explainQuantity(quantity),
      "pdu",
    ),
  ];
  const status: MessageStatus = diagnostics.some((item) => item.severity === "error") ? "malformed" : "valid";
  return finish("request", originalText, normalizedHex, bytes, status, diagnostics, mbap, fields, {
    functionCode,
    baseFunction: baseFunction(functionCode),
    startingAddress,
    quantity,
  });
}

function decodeResponse(
  originalText: string,
  normalizedHex: string,
  bytes: number[],
  mbap: MbapView,
  pdu: number[],
  functionCode: number,
  diagnostics: Diagnostic[],
): MessageDecode {
  const header = mbapFields("response", bytes, mbap);
  if (functionCode === 0x83 || functionCode === 0x84) {
    if (pdu.length !== 2) {
      diagnostics.push(
        diagnostic(
          "EXCEPTION_PDU_LENGTH",
          "error",
          `An exception response PDU must be exactly two bytes: the exception function code and one exception code. This PDU is ${pdu.length} byte${pdu.length === 1 ? "" : "s"}. It was not treated as a protocol exception.`,
          { byteRange: { start: 7, end: bytes.length - 1 } },
        ),
      );
      return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
        functionCode,
        baseFunction: baseFunction(functionCode),
      });
    }
    const exceptionCode = pdu[1];
    if (exceptionCode === undefined) {
      diagnostics.push(diagnostic("EXCEPTION_PDU_LENGTH", "error", "The exception code byte is missing."));
      return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
        functionCode,
        baseFunction: baseFunction(functionCode),
      });
    }
    const name = exceptionName(exceptionCode);
    if (!name) {
      diagnostics.push(
        diagnostic(
          "EXCEPTION_CODE_UNKNOWN",
          "info",
          `Exception code 0x${toHexByte(exceptionCode)} has no name in this decoder. No explanation was invented.`,
          { byteRange: { start: 8, end: 8 } },
        ),
      );
    }
    const fields = [
      ...header,
      field(
        "response",
        "function",
        "Function code",
        bytes,
        7,
        7,
        functionLabel(functionCode),
        explainFunction(functionCode, "response"),
        "exception",
      ),
      field(
        "response",
        "exception-code",
        "Exception code",
        bytes,
        8,
        8,
        name ? `${toHexByte(exceptionCode)} (${name})` : `0x${toHexByte(exceptionCode)} (unknown)`,
        explainException(exceptionCode),
        "exception",
      ),
    ];
    return finish("response", originalText, normalizedHex, bytes, "exception", diagnostics, mbap, fields, {
      functionCode,
      baseFunction: baseFunction(functionCode),
      exceptionCode,
      exceptionName: name,
      exceptionKnown: name !== null,
    });
  }

  if (functionCode !== 3 && functionCode !== 4) {
    diagnostics.push(
      diagnostic("FUNCTION_UNSUPPORTED", "info", explainUnsupported(functionCode), {
        byteRange: { start: 7, end: bytes.length - 1 },
      }),
    );
    return finish("response", originalText, normalizedHex, bytes, "unsupported", diagnostics, mbap, [
      ...header,
      field(
        "response",
        "function",
        "Function code",
        bytes,
        7,
        7,
        functionLabel(functionCode),
        explainFunction(functionCode, "response"),
        "pdu",
      ),
      field(
        "response",
        "raw-pdu",
        "Raw PDU",
        bytes,
        7,
        bytes.length - 1,
        formatBytes(pdu),
        explainUnsupported(functionCode),
        "pdu",
      ),
    ], { functionCode, baseFunction: baseFunction(functionCode) });
  }

  if (pdu.length < 2) {
    diagnostics.push(
      diagnostic(
        "PDU_TOO_SHORT",
        "error",
        "A normal function 03/04 response needs a function code and a byte count.",
        { byteRange: { start: 7, end: bytes.length - 1 } },
      ),
    );
    return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
      functionCode,
      baseFunction: baseFunction(functionCode),
    });
  }

  const byteCount = pdu[1];
  if (byteCount === undefined) {
    diagnostics.push(diagnostic("PDU_TOO_SHORT", "error", "The byte count is missing."));
    return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, header, {
      functionCode,
      baseFunction: baseFunction(functionCode),
    });
  }
  const data = pdu.slice(2);
  if (byteCount < MIN_BYTE_COUNT || byteCount > MAX_BYTE_COUNT) {
    diagnostics.push(
      diagnostic(
        "BYTE_COUNT_INVALID",
        "error",
        `Byte count is ${byteCount}. A normal function 03/04 response byte count must be from ${MIN_BYTE_COUNT} through ${MAX_BYTE_COUNT}.`,
        { byteRange: { start: 8, end: 8 } },
      ),
    );
  }
  if (byteCount % 2 !== 0) {
    diagnostics.push(
      diagnostic(
        "BYTE_COUNT_ODD",
        "error",
        `Byte count is ${byteCount}. Register data must be an even number of bytes because each register is two bytes.`,
        { byteRange: { start: 8, end: 8 } },
      ),
    );
  }
  if (data.length !== byteCount) {
    diagnostics.push(
      diagnostic(
        "BYTE_COUNT_DATA_MISMATCH",
        "error",
        `Byte count is ${byteCount} but the PDU contains ${data.length} data byte${data.length === 1 ? "" : "s"}. Those counts must match exactly.`,
        { byteRange: { start: 8, end: bytes.length - 1 } },
      ),
    );
  }

  const headerFields = [
    ...header,
    field(
      "response",
      "function",
      "Function code",
      bytes,
      7,
      7,
      functionLabel(functionCode),
      explainFunction(functionCode, "response"),
      "pdu",
    ),
    field(
      "response",
      "byte-count",
      "Byte count",
      bytes,
      8,
      8,
      String(byteCount),
      explainByteCount(byteCount),
      "pdu",
    ),
  ];

  if (diagnostics.some((item) => item.severity === "error")) {
    return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, headerFields, {
      functionCode,
      baseFunction: baseFunction(functionCode),
      byteCount,
    });
  }

  const words: number[] = [];
  const wordFields: DecodedField[] = [];
  for (let index = 0; index < data.length; index += 2) {
    const word = readU16(data, index);
    if (word === null) {
      diagnostics.push(diagnostic("BYTE_COUNT_DATA_MISMATCH", "error", "A register word ran past the validated data."));
      return finish("response", originalText, normalizedHex, bytes, "malformed", diagnostics, mbap, headerFields, {
        functionCode,
        baseFunction: baseFunction(functionCode),
        byteCount,
      });
    }
    words.push(word);
    const wordIndex = index / 2;
    const byteStart = 9 + index;
    const rawHex = formatBytes(data.slice(index, index + 2));
    wordFields.push(
      field(
        "response",
        `word-${wordIndex}`,
        `Register word ${wordIndex}`,
        bytes,
        byteStart,
        byteStart + 1,
        `${word} (0x${toHexWord(word)})`,
        explainRawWord(wordIndex, rawHex, word),
        "register",
      ),
    );
  }

  return finish("response", originalText, normalizedHex, bytes, "valid", diagnostics, mbap, [...headerFields, ...wordFields], {
    functionCode,
    baseFunction: baseFunction(functionCode),
    byteCount,
    words,
  });
}
