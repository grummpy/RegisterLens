import type { AnalysisResult } from "../analysis/analyze";
import type { Diagnostic } from "../protocol/diagnostics";
import type { MessageDecode } from "../protocol/types";
import type { RegisterView } from "../map/interpret";
import { APP_VERSION, DECODER_VERSION, MAPPER_VERSION, REPORT_SCHEMA_VERSION } from "../version";

export interface EvidenceReport {
  schemaVersion: number;
  kind: "register-lens-evidence";
  generatedAt: string;
  captureTime: string | null;
  provenance: {
    verified: false;
    syntheticPreset: { id: string; label: string } | null;
    userNote: string | null;
    statement: string;
  };
  versions: {
    app: string;
    decoder: string;
    mapper: string;
  };
  disclaimer: string;
  limitations: readonly string[];
  assumptions: readonly string[];
  unknowns: string[];
  map: null | {
    name: string;
    mapVersion: string;
    source: string;
    loadedEntryCount: number;
    appliedEntries: AppliedEntry[];
  };
  request: MessageReport | null;
  response: MessageReport | null;
  pairing: {
    status: string;
    checks: AnalysisResult["pairing"]["checks"];
    diagnostics: Diagnostic[];
  };
  values: ValueReport[];
  inputDiagnostics: Diagnostic[];
}

interface AppliedEntry {
  unitId: number;
  functionCode: number;
  address: number;
  label: string | null;
  displayAddress: string | null;
  type: "uint16" | "int16" | null;
  scale: number | null;
  offset: number | null;
  unit: string | null;
  wordIndex: number;
}

interface MessageReport {
  direction: "request" | "response";
  directionNote: string;
  status: string;
  originalText: string;
  normalizedHex: string | null;
  bytes: number[];
  mbap: MessageDecode["mbap"];
  functionCode: number | null;
  startingAddress: number | null;
  quantity: number | null;
  byteCount: number | null;
  words: number[] | null;
  exception: null | { code: number; name: string | null; known: boolean };
  fields: MessageDecode["fields"];
  diagnostics: Diagnostic[];
}

interface ValueReport {
  wordIndex: number;
  address: number | null;
  addressHex: string | null;
  documentationLabel: string | null;
  displayAddress: string | null;
  rawHex: string;
  rawUnsigned: number;
  byteRange: { start: number; end: number };
  typed: RegisterView["typed"];
  engineering: null | {
    value: number;
    display: string;
    internal: string;
    displayRounded: boolean;
    formula: string;
  };
  unit: string | null;
  unitStatement: string;
  meaning: RegisterView["meaning"];
  unknowns: string[];
  mapEntryApplied: boolean;
}

const DIRECTION_NOTE = "Direction is user-assigned. It was not inferred from bytes.";

function messageReport(message: MessageDecode | null): MessageReport | null {
  if (!message) {
    return null;
  }
  return {
    direction: message.role,
    directionNote: DIRECTION_NOTE,
    status: message.status,
    originalText: message.originalText,
    normalizedHex: message.normalizedHex,
    bytes: message.bytes,
    mbap: message.mbap,
    functionCode: message.functionCode,
    startingAddress: message.startingAddress,
    quantity: message.quantity,
    byteCount: message.byteCount,
    words: message.words,
    exception:
      message.exceptionCode === null
        ? null
        : { code: message.exceptionCode, name: message.exceptionName, known: message.exceptionKnown },
    fields: message.fields,
    diagnostics: message.diagnostics,
  };
}

function valueReport(register: RegisterView): ValueReport {
  return {
    wordIndex: register.wordIndex,
    address: register.address,
    addressHex: register.addressHex,
    documentationLabel: register.documentationLabel,
    displayAddress: register.displayAddress,
    rawHex: register.rawHex,
    rawUnsigned: register.rawUnsigned,
    byteRange: { start: register.byteStart, end: register.byteEnd },
    typed: register.typed,
    engineering: register.engineering,
    unit: register.unit,
    unitStatement: register.unitStatement,
    meaning: register.meaning,
    unknowns: register.unknowns,
    mapEntryApplied: register.mapEntryApplied,
  };
}

export function buildEvidence(result: AnalysisResult, generatedAt: string): EvidenceReport {
  const appliedEntries: AppliedEntry[] = [];
  if (result.map.map) {
    for (const register of result.registers) {
      if (!register.mapEntryApplied || register.address === null) {
        continue;
      }
      const entry = result.map.map.entries.find(
        (candidate) =>
          candidate.address === register.address &&
          candidate.unitId === result.request?.mbap?.unitId &&
          candidate.functionCode === result.request?.baseFunction,
      );
      if (!entry) {
        continue;
      }
      appliedEntries.push({ ...entry, wordIndex: register.wordIndex });
    }
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    kind: "register-lens-evidence",
    generatedAt,
    captureTime: result.captureTime,
    provenance: {
      verified: false,
      syntheticPreset: result.syntheticPreset,
      userNote: result.provenanceNote,
      statement: result.provenanceStatement,
    },
    versions: {
      app: APP_VERSION,
      decoder: DECODER_VERSION,
      mapper: MAPPER_VERSION,
    },
    disclaimer: result.disclaimer,
    limitations: result.limitations,
    assumptions: result.assumptions,
    unknowns: result.unknowns,
    map: result.map.map
      ? {
          name: result.map.map.name,
          mapVersion: result.map.map.mapVersion,
          source: result.map.map.source,
          loadedEntryCount: result.map.map.entries.length,
          appliedEntries,
        }
      : null,
    request: messageReport(result.request),
    response: messageReport(result.response),
    pairing: {
      status: result.pairing.status,
      checks: result.pairing.checks,
      diagnostics: result.pairing.diagnostics,
    },
    values: result.registers.map(valueReport),
    inputDiagnostics: result.inputDiagnostics,
  };
}

export function escapeMarkdownText(value: string): string {
  return value
    // Inline and table fields must not create a new Markdown block. Preserve
    // the fact that a line break occurred without allowing a heading/list.
    .replace(/\r\n?|\n/g, " ↩ ")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/~/g, "\\~")
    .replace(/#/g, "\\#")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function block(value: string): string {
  // Code blocks retain original evidence text. Pick a fence longer than any
  // run supplied in that text so it cannot close the block early.
  const longestTildeRun = Math.max(0, ...Array.from(value.matchAll(/~+/g), (match) => match[0].length));
  const fence = "~".repeat(Math.max(4, longestTildeRun + 1));
  return [fence, value.replace(/\r\n?/g, "\n"), fence].join("\n");
}

function diagLines(diagnostics: readonly Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "_None._\n";
  }
  return diagnostics
    .map((item) => {
      const where = [
        item.path ? `path ${item.path}` : "",
        item.index !== undefined ? `index ${item.index}` : "",
        item.byteRange ? `bytes ${item.byteRange.start}-${item.byteRange.end}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `- **${item.severity} ${item.code}**${where ? ` (${where})` : ""}: ${escapeMarkdownText(item.message)}`;
    })
    .join("\n");
}

function messageSection(title: string, message: MessageReport | null): string {
  if (!message) {
    return `## ${title}\n\n_Empty._\n`;
  }
  const fieldRows = message.fields
    .map(
      (field) =>
        `| ${escapeMarkdownText(field.name)} | ${field.byteStart}–${field.byteEnd} | ${escapeMarkdownText(field.rawHex)} | ${escapeMarkdownText(field.parsedValue)} | ${escapeMarkdownText(field.explanation)} |`,
    )
    .join("\n");
  return [
    `## ${title}`,
    "",
    `- Direction: ${message.direction}`,
    `- ${escapeMarkdownText(message.directionNote)}`,
    `- Status: ${message.status}`,
    message.normalizedHex ? `- Normalized bytes: \`${message.normalizedHex}\`` : "- Normalized bytes: _none_",
    "",
    "### Original input text",
    "",
    block(message.originalText),
    "",
    "### Fields",
    "",
    "| Field | Byte offsets | Raw hex | Parsed | Explanation |",
    "| --- | --- | --- | --- | --- |",
    fieldRows || "| _none_ |  |  |  |  |",
    "",
    "### Diagnostics",
    "",
    diagLines(message.diagnostics),
    "",
  ].join("\n");
}

export function renderMarkdown(report: EvidenceReport): string {
  const preset = report.provenance.syntheticPreset
    ? `${report.provenance.syntheticPreset.label} (${report.provenance.syntheticPreset.id})`
    : "none";
  const valueRows = report.values
    .map((value) => {
      const typed = value.typed ? `${value.typed.type} ${value.typed.value}` : "unknown";
      const engineering = value.engineering
        ? `${value.engineering.display} (internal ${value.engineering.internal}; formula ${value.engineering.formula}; display rounded: ${value.engineering.displayRounded})`
        : "not calculated";
      return `| ${value.wordIndex} | ${value.address ?? "unknown"} | ${value.addressHex ?? "unknown"} | ${escapeMarkdownText(value.rawHex)} | ${value.rawUnsigned} | ${escapeMarkdownText(typed)} | ${escapeMarkdownText(engineering)} | ${escapeMarkdownText(value.unitStatement)} | ${escapeMarkdownText(value.unknowns.join("; ") || "none")} |`;
    })
    .join("\n");
  const mapSection = report.map
    ? [
        `- Name: ${escapeMarkdownText(report.map.name)}`,
        `- Map version: ${escapeMarkdownText(report.map.mapVersion)}`,
        `- Source: ${escapeMarkdownText(report.map.source)}`,
        `- Loaded entries: ${report.map.loadedEntryCount}`,
        `- Applied entries: ${report.map.appliedEntries.length}`,
        "",
        block(JSON.stringify(report.map.appliedEntries, null, 2)),
      ].join("\n")
    : "_No valid map was loaded._";

  return [
    "# Register Lens evidence report",
    "",
    escapeMarkdownText(report.disclaimer),
    "",
    "This report is not authentication and not a chain of custody.",
    "",
    "## Report identity",
    "",
    `- Report schema version: ${report.schemaVersion}`,
    `- Kind: ${report.kind}`,
    `- Generated at: ${report.generatedAt}`,
    `- Capture time (user-supplied, unverified): ${report.captureTime ? escapeMarkdownText(report.captureTime) : "(none)"}`,
    `- App version: ${report.versions.app}`,
    `- Decoder version: ${report.versions.decoder}`,
    `- Mapper version: ${report.versions.mapper}`,
    "",
    "## Provenance",
    "",
    "- Verified: no",
    `- Synthetic preset: ${escapeMarkdownText(preset)}`,
    `- User note: ${report.provenance.userNote ? escapeMarkdownText(report.provenance.userNote) : "(none)"}`,
    `- Statement: ${escapeMarkdownText(report.provenance.statement)}`,
    "",
    "## Limitations",
    "",
    report.limitations.map((line) => `- ${escapeMarkdownText(line)}`).join("\n"),
    "",
    "## Assumptions",
    "",
    report.assumptions.map((line) => `- ${escapeMarkdownText(line)}`).join("\n"),
    "",
    "## Unknowns",
    "",
    report.unknowns.length ? report.unknowns.map((line) => `- ${escapeMarkdownText(line)}`).join("\n") : "_None listed._",
    "",
    "## Map",
    "",
    mapSection,
    "",
    messageSection("Request", report.request),
    messageSection("Response", report.response),
    "## Pairing",
    "",
    `- Status: ${report.pairing.status}`,
    "",
    report.pairing.checks
      .map((check) => `- ${check.name}: ${check.passed === null ? "not checked" : check.passed ? "pass" : "fail"} — ${escapeMarkdownText(check.detail)}`)
      .join("\n"),
    "",
    diagLines(report.pairing.diagnostics),
    "",
    "## Values",
    "",
    "| Word | Address | Address hex | Raw hex | Raw unsigned | Typed | Engineering | Unit | Unknowns |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    valueRows || "| _none_ |  |  |  |  |  |  |  |  |",
    "",
    "## Input diagnostics",
    "",
    diagLines(report.inputDiagnostics),
    "",
  ].join("\n");
}

export function evidenceJson(report: EvidenceReport): string {
  return JSON.stringify(report, null, 2);
}
