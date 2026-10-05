import { ASSUMPTIONS, DISCLAIMER, LIMITATIONS, PROVENANCE_STATEMENT } from "../copy";
import { decodeMessage } from "../protocol/decodeMessage";
import { diagnostic, type Diagnostic } from "../protocol/diagnostics";
import type { MessageDecode } from "../protocol/types";
import { explainLength } from "../explain/explain";
import { interpretWord, type RegisterView } from "../map/interpret";
import { findEntry } from "../map/types";
import { validateMapText, type MapValidation } from "../map/validateMap";

export interface AnalyzeInput {
  requestText: string;
  responseText: string;
  mapText: string;
  captureTime: string;
  provenanceNote: string;
  syntheticPresetId: string | null;
  syntheticPresetLabel: string | null;
}

export interface PairingCheck {
  name: "transactionId" | "unitId" | "function" | "quantity";
  passed: boolean | null;
  detail: string;
}

export type PairingStatus =
  | "not_applicable"
  | "request_only"
  | "orphan_response"
  | "matched"
  | "matched_exception"
  | "unmatched";

export interface PairingResult {
  status: PairingStatus;
  checks: PairingCheck[];
  diagnostics: Diagnostic[];
}

export interface AnalysisResult {
  request: MessageDecode | null;
  response: MessageDecode | null;
  map: MapValidation;
  pairing: PairingResult;
  registers: RegisterView[];
  explanations: string[];
  assumptions: readonly string[];
  limitations: readonly string[];
  unknowns: string[];
  captureTime: string | null;
  provenanceNote: string | null;
  syntheticPreset: { id: string; label: string } | null;
  disclaimer: string;
  provenanceStatement: string;
  inputDiagnostics: Diagnostic[];
}

function blankChecks(detail: string): PairingCheck[] {
  return [
    { name: "transactionId", passed: null, detail },
    { name: "unitId", passed: null, detail },
    { name: "function", passed: null, detail },
    { name: "quantity", passed: null, detail },
  ];
}

function idsMatch(request: MessageDecode, response: MessageDecode): { transaction: boolean; unit: boolean } {
  return {
    transaction: request.mbap?.transactionId === response.mbap?.transactionId,
    unit: request.mbap?.unitId === response.mbap?.unitId,
  };
}

export function pairMessages(request: MessageDecode | null, response: MessageDecode | null): PairingResult {
  if (!request && !response) {
    return { status: "not_applicable", checks: blankChecks("No messages were supplied."), diagnostics: [] };
  }
  if (request && !response) {
    return {
      status: "request_only",
      checks: blankChecks("No response was supplied. The request can be inspected alone."),
      diagnostics: [],
    };
  }
  if (!request && response) {
    return {
      status: "orphan_response",
      checks: blankChecks("No request was supplied, so addresses are unknown."),
      diagnostics: [
        diagnostic(
          "ORPHAN_RESPONSE",
          "info",
          "This response has no request beside it. Word indices and unsigned raw words can be shown. Addresses and meanings stay unknown.",
        ),
      ],
    };
  }
  if (!request || !response) {
    return { status: "not_applicable", checks: blankChecks("No messages were supplied."), diagnostics: [] };
  }

  if (request.status !== "valid") {
    const responseReadable = response.status === "valid" || response.status === "exception";
    return {
      status: responseReadable ? "orphan_response" : "unmatched",
      checks: blankChecks("The request is not a valid function 03 or 04 read, so it cannot anchor addresses."),
      diagnostics: [
        diagnostic(
          "PAIR_REQUEST_INVALID",
          "warning",
          "Address-based interpretation needs a valid matching request. This request did not validate as function 03 or 04.",
        ),
      ],
    };
  }

  if (response.status === "malformed") {
    return {
      status: "unmatched",
      checks: blankChecks("The response frame is malformed, so it was not paired."),
      diagnostics: [
        diagnostic(
          "PAIR_RESPONSE_INVALID",
          "warning",
          "The response is malformed, so it was not paired and no engineering values were taken from it.",
        ),
      ],
    };
  }

  if (response.status === "unsupported") {
    return {
      status: "unmatched",
      checks: blankChecks("The response function is unsupported."),
      diagnostics: [
        diagnostic(
          "FUNCTION_UNSUPPORTED",
          "info",
          "The response function is not 03, 04, 83, or 84. No registers were interpreted.",
        ),
      ],
    };
  }

  const { transaction, unit } = idsMatch(request, response);
  const functionMatch =
    response.status === "exception"
      ? response.baseFunction !== null && response.baseFunction === request.baseFunction
      : response.functionCode === request.functionCode;
  const quantityMatch =
    response.status === "exception" ? null : response.byteCount === (request.quantity ?? -1) * 2;

  const checks: PairingCheck[] = [
    {
      name: "transactionId",
      passed: transaction,
      detail: transaction
        ? `Transaction ID ${request.mbap?.transactionId} matches.`
        : `Transaction ID ${request.mbap?.transactionId} does not match response ${response.mbap?.transactionId}.`,
    },
    {
      name: "unitId",
      passed: unit,
      detail: unit
        ? `Unit ID ${request.mbap?.unitId} matches.`
        : `Unit ID ${request.mbap?.unitId} does not match response ${response.mbap?.unitId}.`,
    },
    {
      name: "function",
      passed: functionMatch,
      detail: functionMatch
        ? `Function ${request.functionCode} matches response ${response.functionCode}.`
        : `Function ${request.functionCode} does not match response ${response.functionCode}.`,
    },
    {
      name: "quantity",
      passed: quantityMatch,
      detail:
        quantityMatch === null
          ? "Exception responses have no register payload, so quantity is not compared."
          : quantityMatch
            ? `Byte count ${response.byteCount} equals 2 × quantity ${request.quantity}.`
            : `Byte count ${response.byteCount} does not equal 2 × quantity ${request.quantity}.`,
    },
  ];

  const diagnostics: Diagnostic[] = [];
  if (!transaction) {
    diagnostics.push(diagnostic("PAIR_TRANSACTION_MISMATCH", "warning", checks[0]?.detail ?? "Transaction ID mismatch."));
  }
  if (!unit) {
    diagnostics.push(diagnostic("PAIR_UNIT_MISMATCH", "warning", checks[1]?.detail ?? "Unit ID mismatch."));
  }
  if (!functionMatch) {
    diagnostics.push(diagnostic("PAIR_FUNCTION_MISMATCH", "warning", checks[2]?.detail ?? "Function mismatch."));
  }
  if (quantityMatch === false) {
    diagnostics.push(diagnostic("PAIR_QUANTITY_MISMATCH", "warning", checks[3]?.detail ?? "Quantity mismatch."));
  }

  if (response.status === "exception" && transaction && unit && functionMatch) {
    return { status: "matched_exception", checks, diagnostics };
  }
  if (response.status === "valid" && transaction && unit && functionMatch && quantityMatch === true) {
    return { status: "matched", checks, diagnostics };
  }
  return { status: "unmatched", checks, diagnostics };
}

function buildRegisters(
  request: MessageDecode | null,
  response: MessageDecode | null,
  pairing: PairingResult,
  mapValidation: MapValidation,
): RegisterView[] {
  if (!response || response.status !== "valid" || !response.words) {
    return [];
  }
  const matched = pairing.status === "matched" && request?.status === "valid";
  const start = matched ? request.startingAddress : null;
  const unitId = matched ? request.mbap?.unitId : null;
  const functionCode = matched ? request.baseFunction : null;
  return response.words.map((word, index) => {
    const address = start === null || start === undefined ? null : start + index;
    const entry =
      address !== null && unitId !== null && unitId !== undefined && functionCode && mapValidation.map
        ? findEntry(mapValidation.map, unitId, functionCode, address)
        : null;
    return interpretWord({
      wordIndex: index,
      unsigned: word,
      byteStart: 9 + index * 2,
      address,
      entry,
      mapStatus: matched ? mapValidation.status : "absent",
    });
  });
}

function buildExplanations(
  request: MessageDecode | null,
  response: MessageDecode | null,
  pairing: PairingResult,
  registers: RegisterView[],
): string[] {
  const lines: string[] = [DISCLAIMER];
  if (pairing.status === "matched" || pairing.status === "matched_exception") {
    lines.push(
      `Request and response were paired on transaction ID ${request?.mbap?.transactionId}, unit ID ${request?.mbap?.unitId}, and function ${request?.functionCode}. Pairing is a consistency check on these bytes, not proof of device identity or capture provenance.`,
    );
  } else if (pairing.status === "unmatched") {
    lines.push("This exchange did not pair. Engineering values and wire addresses from the response are not shown as trusted readings.");
  } else if (pairing.status === "orphan_response") {
    lines.push("The response is alone. Addresses and meanings are unknown.");
  } else if (pairing.status === "request_only") {
    lines.push("No response was supplied. The request can be inspected alone. Nothing was paired.");
  }
  if (request?.mbap && request.status !== "malformed") {
    lines.push(explainLength(request.mbap.length));
  }
  if (response?.mbap && response.status !== "malformed") {
    lines.push(explainLength(response.mbap.length));
  }
  if (response?.status === "exception" && response.exceptionCode !== null) {
    const exceptionField = response.fields.find((item) => item.id === "response-exception-code");
    if (exceptionField) {
      lines.push(exceptionField.explanation);
    }
  }
  for (const register of registers) {
    lines.push(register.explanation);
  }
  return lines;
}

export function analyzeExchange(input: AnalyzeInput): AnalysisResult {
  const inputDiagnostics: Diagnostic[] = [];
  const captureTime = input.captureTime.trim();
  const provenanceNote = input.provenanceNote.trim();
  if ([...captureTime].length > 256) {
    inputDiagnostics.push(diagnostic("NOTE_TOO_LONG", "error", "Capture time is over 256 characters and was left out of the result."));
  }
  if ([...provenanceNote].length > 256) {
    inputDiagnostics.push(
      diagnostic("NOTE_TOO_LONG", "error", "Provenance note is over 256 characters and was left out of the result."),
    );
  }

  const request = decodeMessage("request", input.requestText);
  const response = decodeMessage("response", input.responseText);
  const map = validateMapText(input.mapText);
  const pairing = pairMessages(request, response);
  const registers = buildRegisters(request, response, pairing, map);
  for (const register of registers) {
    const field = response?.fields.find((item) => item.id === register.fieldId);
    if (field) {
      field.explanation = register.explanation;
      field.parsedValue = register.engineering
        ? `${register.engineering.display} ${register.unitStatement}`
        : `${register.rawUnsigned} (0x${register.rawHex.replace(" ", "")}) raw`;
    }
  }

  const unknowns = [
    ...registers.flatMap((register) => register.unknowns),
    ...(map.status === "invalid" ? ["The register map is invalid, so explicit interpretations were not applied."] : []),
    ...(pairing.status === "unmatched" ? ["The exchange is unmatched, so response addresses stay unknown."] : []),
    ...(pairing.status === "orphan_response" ? ["No paired request is available, so addresses stay unknown."] : []),
  ];

  return {
    request,
    response,
    map,
    pairing,
    registers,
    explanations: buildExplanations(request, response, pairing, registers),
    assumptions: ASSUMPTIONS,
    limitations: LIMITATIONS,
    unknowns: [...new Set(unknowns)],
    captureTime: captureTime.length > 0 && [...captureTime].length <= 256 ? captureTime : null,
    provenanceNote: provenanceNote.length > 0 && [...provenanceNote].length <= 256 ? provenanceNote : null,
    syntheticPreset:
      input.syntheticPresetId && input.syntheticPresetLabel
        ? { id: input.syntheticPresetId, label: input.syntheticPresetLabel }
        : null,
    disclaimer: DISCLAIMER,
    provenanceStatement: PROVENANCE_STATEMENT,
    inputDiagnostics,
  };
}
