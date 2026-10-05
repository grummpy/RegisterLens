import { diagnostic, type Diagnostic } from "../protocol/diagnostics";
import { MAX_LABEL, MAX_MAP_ENTRIES, MAX_MAP_TEXT_BYTES, MAX_TEXT_FIELD, MAX_UNIT, textLength, utf8ByteLength } from "../protocol/limits";
import { findEntry, type MapEntry, type RegisterMap } from "./types";

export interface MapValidation {
  status: "absent" | "valid" | "invalid";
  map: RegisterMap | null;
  diagnostics: Diagnostic[];
}

const TOP_LEVEL_FIELDS = ["schemaVersion", "name", "mapVersion", "source", "entries"] as const;
const ENTRY_FIELDS = [
  "unitId",
  "functionCode",
  "address",
  "label",
  "displayAddress",
  "type",
  "scale",
  "offset",
  "unit",
] as const;
const REQUIRED_ENTRY_FIELDS = ["unitId", "functionCode", "address", "type", "scale", "offset", "unit"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaError(path: string, message: string): Diagnostic {
  return diagnostic("MAP_SCHEMA", "error", `${path}: ${message}`, { path });
}

export function validateMapText(text: string): MapValidation {
  if (text.trim() === "") {
    return { status: "absent", map: null, diagnostics: [] };
  }
  if (text.length > MAX_MAP_TEXT_BYTES || utf8ByteLength(text) > MAX_MAP_TEXT_BYTES) {
    return {
      status: "invalid",
      map: null,
      diagnostics: [
        diagnostic(
          "MAP_TOO_LARGE",
          "error",
          `Register map JSON is over ${MAX_MAP_TEXT_BYTES} bytes (256 KiB). It was not parsed.`,
        ),
      ],
    };
  }
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON.parse failed";
    return {
      status: "invalid",
      map: null,
      diagnostics: [diagnostic("MAP_JSON_INVALID", "error", `Register map is not valid JSON. ${detail}`, { path: "$" })],
    };
  }
  return validateMapValue(parsed);
}

export function validateMapValue(value: unknown): MapValidation {
  const diagnostics: Diagnostic[] = [];
  if (!isPlainObject(value)) {
    return { status: "invalid", map: null, diagnostics: [schemaError("$", "Map must be a JSON object.")] };
  }

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_FIELDS.includes(key as (typeof TOP_LEVEL_FIELDS)[number])) {
      diagnostics.push(schemaError(`$.${key}`, `Unknown field "${key}".`));
    }
  }

  if (!Object.prototype.hasOwnProperty.call(value, "schemaVersion")) {
    diagnostics.push(schemaError("$.schemaVersion", "Required field schemaVersion is missing."));
  } else if (value.schemaVersion !== 1) {
    diagnostics.push(
      schemaError("$.schemaVersion", `Unsupported schemaVersion ${JSON.stringify(value.schemaVersion)}. Only 1 is accepted.`),
    );
  }

  const name = readBoundedString(value, "name", "$.name", MAX_TEXT_FIELD, diagnostics);
  const mapVersion = readBoundedString(value, "mapVersion", "$.mapVersion", MAX_TEXT_FIELD, diagnostics);
  const source = readBoundedString(value, "source", "$.source", MAX_TEXT_FIELD, diagnostics);

  if (!Object.prototype.hasOwnProperty.call(value, "entries")) {
    diagnostics.push(schemaError("$.entries", "Required field entries is missing."));
  } else if (!Array.isArray(value.entries)) {
    diagnostics.push(schemaError("$.entries", "entries must be an array."));
  } else if (value.entries.length > MAX_MAP_ENTRIES) {
    diagnostics.push(
      diagnostic(
        "MAP_ENTRY_LIMIT",
        "error",
        `$.entries: ${value.entries.length} entries exceed the limit of ${MAX_MAP_ENTRIES}. Entries were not interpreted.`,
        { path: "$.entries" },
      ),
    );
  }

  if (diagnostics.length > 0 || !Array.isArray(value.entries) || typeof name !== "string" || typeof mapVersion !== "string" || typeof source !== "string") {
    return { status: "invalid", map: null, diagnostics };
  }

  const entries: MapEntry[] = [];
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = readEntry(value.entries[index], index, diagnostics);
    if (entry) {
      entries.push(entry);
    }
  }
  if (diagnostics.length > 0) {
    return { status: "invalid", map: null, diagnostics };
  }

  const seen = new Map<string, number>();
  entries.forEach((entry, index) => {
    const key = `${entry.unitId}:${entry.functionCode}:${entry.address}`;
    const first = seen.get(key);
    if (first !== undefined) {
      diagnostics.push(
        diagnostic(
          "MAP_DUPLICATE",
          "error",
          `$.entries[${index}]: Duplicate selector (unitId ${entry.unitId}, functionCode ${entry.functionCode}, address ${entry.address}) already used at $.entries[${first}].`,
          { path: `$.entries[${index}]` },
        ),
      );
    } else {
      seen.set(key, index);
    }
  });
  if (diagnostics.length > 0) {
    return { status: "invalid", map: null, diagnostics };
  }

  return {
    status: "valid",
    map: { schemaVersion: 1, name, mapVersion, source, entries },
    diagnostics: [],
  };
}

function readBoundedString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  max: number,
  diagnostics: Diagnostic[],
): string | null {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    diagnostics.push(schemaError(path, `Required field ${key} is missing.`));
    return null;
  }
  const value = source[key];
  if (typeof value !== "string") {
    diagnostics.push(schemaError(path, `${key} must be a string.`));
    return null;
  }
  if (textLength(value) > max) {
    diagnostics.push(schemaError(path, `${key} is ${textLength(value)} characters. The maximum is ${max}.`));
    return null;
  }
  return value;
}

function readEntry(value: unknown, index: number, diagnostics: Diagnostic[]): MapEntry | null {
  const path = `$.entries[${index}]`;
  if (!isPlainObject(value)) {
    diagnostics.push(schemaError(path, "Entry must be a JSON object."));
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!ENTRY_FIELDS.includes(key as (typeof ENTRY_FIELDS)[number])) {
      diagnostics.push(schemaError(`${path}.${key}`, `Unknown field "${key}".`));
    }
  }
  for (const key of REQUIRED_ENTRY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      diagnostics.push(schemaError(`${path}.${key}`, `Required field ${key} is missing.`));
    }
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(value, key);
  const unitId = has("unitId") ? readInteger(value.unitId, `${path}.unitId`, 0, 255, diagnostics) : null;
  const functionCode = has("functionCode") ? readFunctionCode(value.functionCode, `${path}.functionCode`, diagnostics) : null;
  const address = has("address") ? readInteger(value.address, `${path}.address`, 0, 65535, diagnostics) : null;
  const label = readOptionalLabel(value, "label", `${path}.label`, MAX_LABEL, diagnostics);
  const displayAddress = readOptionalLabel(value, "displayAddress", `${path}.displayAddress`, MAX_LABEL, diagnostics);
  const type = has("type") ? readType(value.type, `${path}.type`, diagnostics) : undefined;
  const scale = has("scale") ? readFiniteOrNull(value.scale, `${path}.scale`, diagnostics) : undefined;
  const offset = has("offset") ? readFiniteOrNull(value.offset, `${path}.offset`, diagnostics) : undefined;
  const unit = has("unit") ? readUnit(value.unit, `${path}.unit`, diagnostics) : undefined;

  if (
    unitId === null ||
    functionCode === null ||
    address === null ||
    label === undefined ||
    displayAddress === undefined ||
    type === undefined ||
    scale === undefined ||
    offset === undefined ||
    unit === undefined ||
    diagnostics.some((item) => item.path === path || item.path?.startsWith(`${path}.`))
  ) {
    return null;
  }

  return {
    unitId,
    functionCode,
    address,
    label,
    displayAddress,
    type,
    scale,
    offset,
    unit,
  };
}

function readInteger(value: unknown, path: string, min: number, max: number, diagnostics: Diagnostic[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    diagnostics.push(schemaError(path, `Expected an integer from ${min} through ${max}.`));
    return null;
  }
  if (value < min || value > max) {
    diagnostics.push(schemaError(path, `Value ${value} is outside ${min} through ${max}.`));
    return null;
  }
  return value;
}

function readFunctionCode(value: unknown, path: string, diagnostics: Diagnostic[]): 3 | 4 | null {
  if (value !== 3 && value !== 4) {
    diagnostics.push(schemaError(path, "functionCode must be 3 or 4."));
    return null;
  }
  return value;
}

function readOptionalLabel(
  source: Record<string, unknown>,
  key: string,
  path: string,
  max: number,
  diagnostics: Diagnostic[],
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    return null;
  }
  const value = source[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    diagnostics.push(schemaError(path, `${key} must be a string when present.`));
    return undefined;
  }
  if (textLength(value) > max) {
    diagnostics.push(schemaError(path, `${key} is ${textLength(value)} characters. The maximum is ${max}.`));
    return undefined;
  }
  return value;
}

function readType(value: unknown, path: string, diagnostics: Diagnostic[]): "uint16" | "int16" | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value === "uint16" || value === "int16") {
    return value;
  }
  diagnostics.push(schemaError(path, 'type must be "uint16", "int16", or null.'));
  return undefined;
}

function readFiniteOrNull(value: unknown, path: string, diagnostics: Diagnostic[]): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push(schemaError(path, "Expected a finite number or null."));
    return undefined;
  }
  return value;
}

function readUnit(value: unknown, path: string, diagnostics: Diagnostic[]): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    diagnostics.push(schemaError(path, "unit must be a string or null."));
    return undefined;
  }
  if (textLength(value) > MAX_UNIT) {
    diagnostics.push(schemaError(path, `unit is ${textLength(value)} characters. The maximum is ${MAX_UNIT}.`));
    return undefined;
  }
  return value;
}

export function lookupEntry(
  map: RegisterMap,
  unitId: number,
  functionCode: 3 | 4,
  address: number,
): MapEntry | null {
  return findEntry(map, unitId, functionCode, address);
}
