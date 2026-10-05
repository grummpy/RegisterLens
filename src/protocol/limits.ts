export const MAX_HEX_TEXT_BYTES = 8 * 1024;
export const MAX_ADU_BYTES = 260;
export const MAX_MAP_TEXT_BYTES = 256 * 1024;
export const MAX_MAP_ENTRIES = 1000;
export const MAX_TEXT_FIELD = 256;
export const MAX_LABEL = 80;
export const MAX_UNIT = 32;
export const MIN_MBAP_LENGTH = 2;
export const MAX_MBAP_LENGTH = 254;
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 125;
export const MIN_BYTE_COUNT = 2;
export const MAX_BYTE_COUNT = 250;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function textLength(text: string): number {
  return Array.from(text).length;
}
