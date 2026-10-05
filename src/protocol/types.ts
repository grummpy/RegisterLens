import type { Diagnostic } from "./diagnostics";

export type MessageRole = "request" | "response";
export type MessageStatus = "valid" | "malformed" | "unsupported" | "exception";
export type FieldKind = "mbap" | "pdu" | "register" | "exception";

export interface DecodedField {
  id: string;
  name: string;
  byteStart: number;
  byteEnd: number;
  rawHex: string;
  parsedValue: string;
  explanation: string;
  kind: FieldKind;
}

export interface MbapView {
  transactionId: number;
  protocolId: number;
  length: number;
  unitId: number;
}

export interface MessageDecode {
  role: MessageRole;
  status: MessageStatus;
  originalText: string;
  normalizedHex: string | null;
  bytes: number[];
  diagnostics: Diagnostic[];
  mbap: MbapView | null;
  functionCode: number | null;
  baseFunction: 3 | 4 | null;
  startingAddress: number | null;
  quantity: number | null;
  byteCount: number | null;
  words: number[] | null;
  exceptionCode: number | null;
  exceptionName: string | null;
  exceptionKnown: boolean;
  fields: DecodedField[];
}
