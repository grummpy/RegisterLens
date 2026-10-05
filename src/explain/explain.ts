import { exceptionName, functionLabel, toHexByte, toHexWord } from "../protocol/bytes";
import type { MessageRole } from "../protocol/types";

export function explainTransactionId(id: number): string {
  return `Transaction ID is ${id} (0x${toHexWord(id)}). A paired response must echo this value. Matching IDs are a consistency check, not proof of which device answered.`;
}

export function explainProtocolId(id: number): string {
  if (id === 0) {
    return "Protocol ID is 0. Modbus TCP requires protocol ID 0.";
  }
  return `Protocol ID is ${id} (0x${toHexWord(id)}). Modbus TCP requires protocol ID 0, so this PDU was not interpreted.`;
}

export function explainLength(length: number): string {
  const total = 6 + length;
  return `Length 0x${toHexWord(length)} is ${length}. It counts the unit ID plus the PDU. It does not count the transaction ID, protocol ID, or the length field. Total application bytes are 6 + ${length} = ${total}.`;
}

export function explainUnitId(id: number): string {
  return `Unit ID is ${id} (0x${toHexByte(id)}). On Modbus TCP this is an unsigned byte from 0 through 255. Serial-only address limits are not applied.`;
}

export function explainFunction(code: number, role: MessageRole): string {
  const label = functionLabel(code);
  if (code === 3 || code === 4) {
    const kind = role === "request" ? "request" : "response";
    const name = code === 3 ? "holding registers" : "input registers";
    return `Function ${label} in the ${kind} box. This MVP reads ${name}. The box selects direction; the bytes are not used to guess it.`;
  }
  if (code === 0x83 || code === 0x84) {
    return `Function ${label}. The high bit marks a device exception for function ${code & 0x7f}. An exception is a device-reported outcome, not a malformed frame. Register Lens does not infer why the device reported it.`;
  }
  return `Function ${label} is not decoded. This MVP covers function 03, function 04, and exception functions 83 and 84. The envelope is shown and the PDU stays raw.`;
}

export function explainAddress(address: number): string {
  return `Starting address is ${address} decimal (0x${toHexWord(address)}). Wire addresses are zero-based. A documentation label such as 40101 is not read from these bytes and is not added or subtracted.`;
}

export function explainQuantity(quantity: number): string {
  return `Quantity is ${quantity} (0x${toHexWord(quantity)}). Function 03 and 04 allow 1 through 125 registers, and start + quantity − 1 must stay within 65535.`;
}

export function explainByteCount(byteCount: number): string {
  return `Byte count is ${byteCount}. A normal response carries two bytes per register, so a paired response needs a byte count of 2 × the requested quantity.`;
}

export function explainRawWord(wordIndex: number, rawHex: string, unsigned: number): string {
  const hi = (unsigned >> 8) & 0xff;
  const lo = unsigned & 0xff;
  return `Word ${wordIndex} bytes ${rawHex} are big-endian. Unsigned value = ${hi} × 256 + ${lo} = ${unsigned} (0x${toHexWord(unsigned)}).`;
}

export function explainException(code: number): string {
  const name = exceptionName(code);
  const hex = toHexByte(code);
  if (name) {
    return `The device reported exception ${hex} (${name}). This is a device-reported outcome, not a malformed frame. Register Lens does not infer the root cause.`;
  }
  return `The device reported exception code 0x${hex}. This code is unknown to Register Lens, so no meaning is invented for it. This is a device-reported outcome, not a malformed frame.`;
}

export function explainUnsupported(code: number): string {
  return `Function code 0x${toHexByte(code)} is outside this MVP. Register Lens decodes function 03, function 04, and exception functions 83 and 84 only. No register interpretation is shown.`;
}

export interface EngineeringExplanationInput {
  wordIndex: number;
  rawHex: string;
  unsigned: number;
  address: number | null;
  typed: { type: "uint16" | "int16"; value: number } | null;
  engineering: { value: number; display: string; formula: string } | null;
  unit: string | null;
  label: string | null;
  displayAddress: string | null;
  unknowns: readonly string[];
}

export function explainRegister(input: EngineeringExplanationInput): string {
  const hi = (input.unsigned >> 8) & 0xff;
  const lo = input.unsigned & 0xff;
  const sentences: string[] = [];
  sentences.push(
    `Word ${input.wordIndex} bytes ${input.rawHex} are big-endian. Unsigned value = ${hi} × 256 + ${lo} = ${input.unsigned} (0x${toHexWord(input.unsigned)}).`,
  );
  if (input.address === null) {
    sentences.push("Address is unknown because this response is not paired with a valid matching request. Meaning is unknown. No map entry was applied.");
  } else {
    sentences.push(
      `Wire address = starting address + word index = ${input.address} (0x${toHexWord(input.address)}).`,
    );
  }
  if (input.typed?.type === "int16") {
    sentences.push(
      `Type int16 uses two's complement. ${input.unsigned} >= 32768 is ${input.unsigned >= 32768 ? "true" : "false"}, so the signed value is ${input.typed.value}.`,
    );
  } else if (input.typed?.type === "uint16") {
    sentences.push(`Type uint16 keeps the unsigned word ${input.unsigned}.`);
  }
  if (input.engineering) {
    const unitText = input.unit ?? "unit unknown";
    const labelText = input.label ? ` Map label “${input.label}” is documentation only.` : "";
    const displayAddressText = input.displayAddress
      ? ` Documentation label ${input.displayAddress} is not a wire address.`
      : "";
    sentences.push(
      `The explicit map supplies the formula ${input.engineering.formula} = ${input.engineering.display} ${unitText}.${labelText}${displayAddressText} The scaled result is shown only because the map states type, scale, and offset. Display shows ${input.engineering.display} with up to 6 decimal digits. The internal result keeps the unrounded IEEE-754 evaluation of typedRaw × scale + offset.`,
    );
  } else if (input.address !== null) {
    sentences.push("No engineering value is calculated. Type, scale, and offset must all be explicit before a scaled result is shown.");
  }
  if (input.unit === null && input.engineering) {
    sentences.push('The map unit is null, so the unit statement is "unit unknown."');
  }
  for (const unknown of input.unknowns) {
    sentences.push(unknown);
  }
  return sentences.join(" ");
}
