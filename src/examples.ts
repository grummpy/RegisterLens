import { mapToJson, signedInputMap, teachingMap } from "./map/template";

export const HOLDING_TEMP_REQUEST = "00 01 00 00 00 06 01 03 00 64 00 01";
export const HOLDING_TEMP_RESPONSE = "00 01 00 00 00 05 01 03 02 00 FD";
export const INPUT_SIGNED_REQUEST = "00 02 00 00 00 06 01 04 00 00 00 02";
export const INPUT_SIGNED_RESPONSE = "00 02 00 00 00 07 01 04 04 FF 9C 00 C8";
export const EXCEPTION_RESPONSE = "00 01 00 00 00 03 01 83 02";

export const TEACHING_MAP_JSON = mapToJson(teachingMap);
export const SIGNED_INPUT_MAP_JSON = mapToJson(signedInputMap);

export const UNKNOWN_ADDRESS_MAP_JSON = JSON.stringify(
  {
    schemaVersion: 1,
    name: "Synthetic map with no matching address",
    mapVersion: "1.0.0",
    source: "Invented demonstration data; no real equipment",
    entries: [
      {
        unitId: 1,
        functionCode: 3,
        address: 999,
        label: "Unrelated demo point",
        displayAddress: "40999",
        type: "uint16",
        scale: 1,
        offset: 0,
        unit: "counts",
      },
    ],
  },
  null,
  2,
);
