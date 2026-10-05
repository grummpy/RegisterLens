import type { RegisterMap } from "./types";

export const teachingMap: RegisterMap = {
  schemaVersion: 1,
  name: "Synthetic teaching map",
  mapVersion: "1.0.0",
  source: "Invented demonstration data; no real equipment",
  entries: [
    {
      unitId: 1,
      functionCode: 3,
      address: 100,
      label: "Demo temperature",
      displayAddress: "40101",
      type: "uint16",
      scale: 0.1,
      offset: 0,
      unit: "°C",
    },
  ],
};

export const signedInputMap: RegisterMap = {
  schemaVersion: 1,
  name: "Synthetic input register map",
  mapVersion: "1.0.0",
  source: "Invented demonstration data; no real equipment",
  entries: [
    {
      unitId: 1,
      functionCode: 4,
      address: 0,
      label: "Demo signed temperature",
      displayAddress: "30001",
      type: "int16",
      scale: 0.1,
      offset: 0,
      unit: "°C",
    },
    {
      unitId: 1,
      functionCode: 4,
      address: 1,
      label: "Demo unsigned count",
      displayAddress: "30002",
      type: "uint16",
      scale: 1,
      offset: 0,
      unit: null,
    },
  ],
};

export function mapToJson(map: RegisterMap): string {
  return JSON.stringify(map, null, 2);
}
