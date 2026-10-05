export function toHexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

export function toHexWord(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

export function formatBytes(bytes: readonly number[]): string {
  return bytes.map((byte) => toHexByte(byte)).join(" ");
}

export function readU16(bytes: readonly number[], offset: number): number | null {
  if (offset < 0 || offset + 1 >= bytes.length) {
    return null;
  }
  const hi = bytes[offset];
  const lo = bytes[offset + 1];
  if (hi === undefined || lo === undefined) {
    return null;
  }
  return (hi << 8) | lo;
}

export const EXCEPTION_NAMES: Readonly<Record<number, string>> = {
  1: "Illegal Function",
  2: "Illegal Data Address",
  3: "Illegal Data Value",
  4: "Server Device Failure",
  5: "Acknowledge",
  6: "Server Device Busy",
  8: "Memory Parity Error",
  10: "Gateway Path Unavailable",
  11: "Gateway Target Device Failed to Respond",
};

export function exceptionName(code: number): string | null {
  return EXCEPTION_NAMES[code] ?? null;
}

export function baseFunction(code: number): 3 | 4 | null {
  if (code === 3 || code === 0x83) {
    return 3;
  }
  if (code === 4 || code === 0x84) {
    return 4;
  }
  return null;
}

export function functionLabel(code: number): string {
  switch (code) {
    case 3:
      return "03 (Read Holding Registers)";
    case 4:
      return "04 (Read Input Registers)";
    case 0x83:
      return "83 (Exception, Read Holding Registers)";
    case 0x84:
      return "84 (Exception, Read Input Registers)";
    default:
      return `0x${toHexByte(code)}`;
  }
}
