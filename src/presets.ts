import {
  EXCEPTION_RESPONSE,
  HOLDING_TEMP_REQUEST,
  HOLDING_TEMP_RESPONSE,
  INPUT_SIGNED_REQUEST,
  INPUT_SIGNED_RESPONSE,
  SIGNED_INPUT_MAP_JSON,
  TEACHING_MAP_JSON,
  UNKNOWN_ADDRESS_MAP_JSON,
} from "./examples";

export interface Preset {
  id: string;
  label: string;
  description: string;
  requestText: string;
  responseText: string;
  mapText: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "holding-temperature",
    label: "Synthetic: Holding register temperature",
    description: "Function 03, address 100, raw 253, explicit scale 0.1 yields 25.3 °C. Synthetic.",
    requestText: HOLDING_TEMP_REQUEST,
    responseText: HOLDING_TEMP_RESPONSE,
    mapText: TEACHING_MAP_JSON,
  },
  {
    id: "input-signed",
    label: "Synthetic: Input registers and signed values",
    description: "Function 04 at addresses 0 and 1. FF9C becomes signed -100 then -10 °C. 00C8 stays 200 with unit unknown. Synthetic.",
    requestText: INPUT_SIGNED_REQUEST,
    responseText: INPUT_SIGNED_RESPONSE,
    mapText: SIGNED_INPUT_MAP_JSON,
  },
  {
    id: "exception-illegal-address",
    label: "Synthetic: Exception illegal data address",
    description: "The same holding-register request paired with exception 02. The device reported Illegal Data Address. Synthetic.",
    requestText: HOLDING_TEMP_REQUEST,
    responseText: EXCEPTION_RESPONSE,
    mapText: TEACHING_MAP_JSON,
  },
  {
    id: "unknown-mapping",
    label: "Synthetic: Unknown mapping",
    description: "Temperature bytes with a map that does not list address 100. Raw 253 stays, meaning unknown. Synthetic.",
    requestText: HOLDING_TEMP_REQUEST,
    responseText: HOLDING_TEMP_RESPONSE,
    mapText: UNKNOWN_ADDRESS_MAP_JSON,
  },
  {
    id: "malformed-length",
    label: "Synthetic: Malformed length",
    description: "Length says 6, so 12 bytes are required, but only 10 bytes are present. Synthetic.",
    requestText: "00 01 00 00 00 06 01 03 00 64",
    responseText: "",
    mapText: "",
  },
  {
    id: "mismatched-transaction",
    label: "Synthetic: Mismatched transaction",
    description: "Response transaction ID 99 does not match request transaction ID 1. Addresses stay unknown. Synthetic.",
    requestText: HOLDING_TEMP_REQUEST,
    responseText: "00 63 00 00 00 05 01 03 02 00 FD",
    mapText: TEACHING_MAP_JSON,
  },
];
