export interface MapEntry {
  unitId: number;
  functionCode: 3 | 4;
  address: number;
  label: string | null;
  displayAddress: string | null;
  type: "uint16" | "int16" | null;
  scale: number | null;
  offset: number | null;
  unit: string | null;
}

export interface RegisterMap {
  schemaVersion: 1;
  name: string;
  mapVersion: string;
  source: string;
  entries: MapEntry[];
}

export function entryKey(unitId: number, functionCode: number, address: number): string {
  return `${unitId}:${functionCode}:${address}`;
}

export function findEntry(
  map: RegisterMap,
  unitId: number,
  functionCode: 3 | 4,
  address: number,
): MapEntry | null {
  const key = entryKey(unitId, functionCode, address);
  for (const entry of map.entries) {
    if (entryKey(entry.unitId, entry.functionCode, entry.address) === key) {
      return entry;
    }
  }
  return null;
}
