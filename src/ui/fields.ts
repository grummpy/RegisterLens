import type { DecodedField } from "../protocol/types";

export function fieldAt(fields: readonly DecodedField[], byteIndex: number): DecodedField | null {
  let best: DecodedField | null = null;
  for (const field of fields) {
    if (byteIndex < field.byteStart || byteIndex > field.byteEnd) {
      continue;
    }
    if (!best || field.byteEnd - field.byteStart < best.byteEnd - best.byteStart) {
      best = field;
    }
  }
  return best;
}

export interface Selection {
  message: "request" | "response";
  fieldId: string | null;
  byteIndex: number | null;
}
