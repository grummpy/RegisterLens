export const DISCLAIMER =
  "Educational offline analysis. Verify device documentation before using interpretations in operational decisions.";

export const ASSUMPTIONS: readonly string[] = [
  "Multi-byte fields are big-endian, as defined for Modbus application data.",
  "Direction is whichever input box the user filled. It is not inferred from function codes.",
  "A map selector is the exact tuple (unitId, functionCode, address). Documentation labels such as 40101 are not wire addresses and are never converted into an offset.",
  "Wire addresses are zero-based integers from 0 through 65535.",
  "The engineering value is typedRaw × scale + offset, and only when type, scale, and offset are all explicit and the result is finite.",
  "Signed 16-bit values use two's complement: values at or above 32768 become value − 65536.",
  "Pairing checks transaction ID, unit ID, and function inside this exchange only. A match is consistency evidence, not device identity and not capture provenance.",
];

export const LIMITATIONS: readonly string[] = [
  DISCLAIMER,
  "Register Lens is not safety-certified, not a compliance verdict, not a device-health monitor, and not an exploitation detector. It does not guarantee correctness.",
  "Only Modbus TCP function 03, function 04, and their exception responses (function 83 and 84) are decoded.",
  "Write functions, Modbus RTU, Modbus ASCII, CRC checks, packet capture, PCAP import, TCP reassembly, sockets, scanning, and live polling are outside this tool.",
  "Multi-word values, floating-point registers, bitfields, byte swapping, and automatic vendor-map discovery are not performed.",
  "This report is not authentication and not a chain of custody.",
  "Capture time and provenance notes are user-supplied and unverified. Generation time is when this report was built on this computer.",
  "Imported text is inert. It is not executed as HTML, a formula, or an instruction.",
  "Data stays in memory until Reset or until the page is closed. Register Lens does not write it to browser storage.",
];

export const PROVENANCE_STATEMENT =
  "Capture provenance is user-supplied and unverified. Pairing is a consistency check on the pasted bytes, not proof of which device produced them. This report is not authentication and not a chain of custody.";
