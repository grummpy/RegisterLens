import { diagnostic, type Diagnostic } from "./diagnostics";
import { formatBytes } from "./bytes";
import { MAX_ADU_BYTES, MAX_HEX_TEXT_BYTES, utf8ByteLength } from "./limits";

export interface HexParseSuccess {
  ok: true;
  bytes: number[];
  normalizedHex: string;
}

export interface HexParseFailure {
  ok: false;
  diagnostics: Diagnostic[];
}

export type HexParseResult = HexParseSuccess | HexParseFailure;

function isAsciiWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f" ||
    character === "\v"
  );
}

function isHexDigit(character: string): boolean {
  return /^[0-9a-fA-F]$/.test(character);
}

export function parseHex(input: string): HexParseResult {
  if (input.length > MAX_HEX_TEXT_BYTES || utf8ByteLength(input) > MAX_HEX_TEXT_BYTES) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "HEX_TOO_LARGE",
          "error",
          `This hex input is over ${MAX_HEX_TEXT_BYTES} bytes (8 KiB). It was not parsed. Shorten it to one application data unit.`,
        ),
      ],
    };
  }

  let digits = "";
  const digitIndexes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) {
      continue;
    }
    if (isAsciiWhitespace(character)) {
      continue;
    }
    if (!isHexDigit(character)) {
      const visible = character === " " ? "space" : JSON.stringify(character);
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            "HEX_INVALID_CHAR",
            "error",
            `Character ${visible} at index ${index} is not a hex digit or ASCII whitespace. Only 0-9, A-F, and ASCII whitespace are accepted.`,
            { index },
          ),
        ],
      };
    }
    digits += character;
    digitIndexes.push(index);
  }

  if (digits.length === 0) {
    return { ok: true, bytes: [], normalizedHex: "" };
  }

  if (digits.length % 2 !== 0) {
    const leftoverIndex = digitIndexes[digitIndexes.length - 1] ?? 0;
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "HEX_ODD_DIGITS",
          "error",
          `Hex digit count is ${digits.length}, which is odd. The leftover digit is at character index ${leftoverIndex}. Add the missing nibble or delete the extra digit.`,
          { index: leftoverIndex },
        ),
      ],
    };
  }

  const bytes: number[] = [];
  for (let index = 0; index < digits.length; index += 2) {
    bytes.push(Number.parseInt(digits.slice(index, index + 2), 16));
  }

  if (bytes.length > MAX_ADU_BYTES) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "ADU_TOO_LONG",
          "error",
          `Decoded messages are limited to ${MAX_ADU_BYTES} bytes. This input contains ${bytes.length} bytes. It was not decoded and was not truncated.`,
        ),
      ],
    };
  }

  return { ok: true, bytes, normalizedHex: formatBytes(bytes) };
}
