import { formatBytes } from "../protocol/bytes";

export function bytesToHex(bytes: readonly number[]): string {
  return formatBytes(bytes);
}

function adu(transactionId: number, unitId: number, pdu: number[]): string {
  const length = 1 + pdu.length;
  const bytes = [
    (transactionId >> 8) & 0xff,
    transactionId & 0xff,
    0,
    0,
    (length >> 8) & 0xff,
    length & 0xff,
    unitId,
    ...pdu,
  ];
  return bytesToHex(bytes);
}

export function buildReadRequest(options: {
  transactionId: number;
  unitId: number;
  functionCode: 3 | 4;
  address: number;
  quantity: number;
}): string {
  return adu(options.transactionId, options.unitId, [
    options.functionCode,
    (options.address >> 8) & 0xff,
    options.address & 0xff,
    (options.quantity >> 8) & 0xff,
    options.quantity & 0xff,
  ]);
}

export function buildReadResponse(options: {
  transactionId: number;
  unitId: number;
  functionCode: 3 | 4;
  words: readonly number[];
}): string {
  const data: number[] = [];
  for (const word of options.words) {
    data.push((word >> 8) & 0xff, word & 0xff);
  }
  return adu(options.transactionId, options.unitId, [options.functionCode, data.length, ...data]);
}

export function buildExceptionResponse(options: {
  transactionId: number;
  unitId: number;
  functionCode: 0x83 | 0x84;
  code: number;
}): string {
  return adu(options.transactionId, options.unitId, [options.functionCode, options.code]);
}
