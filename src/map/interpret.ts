import { formatBytes, toHexWord } from "../protocol/bytes";
import { diagnostic, type Diagnostic } from "../protocol/diagnostics";
import { explainRegister } from "../explain/explain";
import type { MapEntry } from "./types";

export interface EngineeringValue {
  value: number;
  display: string;
  internal: string;
  displayRounded: boolean;
  formula: string;
}

export interface RegisterView {
  fieldId: string;
  wordIndex: number;
  address: number | null;
  addressHex: string | null;
  documentationLabel: string | null;
  displayAddress: string | null;
  rawHex: string;
  rawUnsigned: number;
  byteStart: number;
  byteEnd: number;
  typed: { type: "uint16" | "int16"; value: number } | null;
  engineering: EngineeringValue | null;
  unit: string | null;
  unitStatement: string;
  meaning: "explicit" | "unknown";
  unknowns: string[];
  explanation: string;
  mapEntryApplied: boolean;
  diagnostics: Diagnostic[];
}

export function unsignedToSigned(unsigned: number): number {
  return unsigned >= 32768 ? unsigned - 65536 : unsigned;
}

export function formatEngineering(value: number): { display: string; internal: string; displayRounded: boolean } {
  const internal = Object.is(value, -0) ? "-0" : value.toString();
  const negative = value < 0 || Object.is(value, -0);
  const body = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    useGrouping: false,
  }).format(Math.abs(value));
  const display = `${negative ? "-" : ""}${body}`;
  const displayRounded = Number(display) !== value || display !== internal;
  return { display, internal, displayRounded };
}

export function interpretWord(options: {
  wordIndex: number;
  unsigned: number;
  byteStart: number;
  address: number | null;
  entry: MapEntry | null;
  mapStatus: "absent" | "valid" | "invalid";
}): RegisterView {
  const rawHex = formatBytes([(options.unsigned >> 8) & 0xff, options.unsigned & 0xff]);
  const unknowns: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let typed: RegisterView["typed"] = null;
  let engineering: EngineeringValue | null = null;
  let unit: string | null = null;
  let label: string | null = null;
  let displayAddress: string | null = null;
  let mapEntryApplied = false;

  if (options.address === null) {
    unknowns.push("Address is unknown, so meaning is unknown.");
  } else if (options.mapStatus === "invalid") {
    unknowns.push("The register map did not validate, so no entry was applied.");
  } else if (options.mapStatus === "absent") {
    unknowns.push("No register map is loaded. Meaning is unknown.");
  } else if (options.entry === null) {
    unknowns.push(
      `No map entry matches unit, function, and address ${options.address}. Meaning is unknown.`,
    );
  } else {
    mapEntryApplied = true;
    label = options.entry.label;
    displayAddress = options.entry.displayAddress;
    unit = options.entry.unit;
    if (options.entry.type !== null) {
      const typedValue = options.entry.type === "int16" ? unsignedToSigned(options.unsigned) : options.unsigned;
      typed = { type: options.entry.type, value: typedValue };
    }
    if (options.entry.type !== null && options.entry.scale !== null && options.entry.offset !== null && typed) {
      const value = typed.value * options.entry.scale + options.entry.offset;
      if (!Number.isFinite(value)) {
        diagnostics.push(
          diagnostic(
            "VALUE_NON_FINITE",
            "error",
            `Word ${options.wordIndex} engineering result is not finite and was discarded.`,
          ),
        );
        unknowns.push("The engineering result was not finite, so it is not shown.");
      } else {
        const formatted = formatEngineering(value);
        const formula = `${typed.value} × ${options.entry.scale} + ${options.entry.offset}`;
        engineering = { value, formula, ...formatted };
      }
    } else {
      if (options.entry.type === null) {
        unknowns.push("Map type is null, so signedness is unknown.");
      }
      if (options.entry.scale === null) {
        unknowns.push("Map scale is null, so no engineering scale was applied.");
      }
      if (options.entry.offset === null) {
        unknowns.push("Map offset is null, so no engineering offset was applied.");
      }
    }
    if (options.entry.unit === null) {
      unknowns.push("Map unit is null, so the unit is unknown.");
    }
  }

  const unitStatement = unit === null ? "unit unknown" : unit;
  const explanation = explainRegister({
    wordIndex: options.wordIndex,
    rawHex,
    unsigned: options.unsigned,
    address: options.address,
    typed,
    engineering,
    unit,
    label,
    displayAddress,
    unknowns,
  });

  return {
    fieldId: `response-word-${options.wordIndex}`,
    wordIndex: options.wordIndex,
    address: options.address,
    addressHex: options.address === null ? null : `0x${toHexWord(options.address)}`,
    documentationLabel: label,
    displayAddress,
    rawHex,
    rawUnsigned: options.unsigned,
    byteStart: options.byteStart,
    byteEnd: options.byteStart + 1,
    typed,
    engineering,
    unit,
    unitStatement,
    meaning: engineering ? "explicit" : "unknown",
    unknowns,
    explanation,
    mapEntryApplied,
    diagnostics,
  };
}
