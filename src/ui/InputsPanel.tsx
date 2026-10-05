import { TEACHING_MAP_JSON } from "../examples";
import type { AnalyzeInput } from "../analysis/analyze";
import { MAX_HEX_TEXT_BYTES, MAX_MAP_TEXT_BYTES } from "../protocol/limits";
import { PRESETS, type Preset } from "../presets";
import { downloadText } from "./download";

interface InputsPanelProps {
  inputs: AnalyzeInput;
  onChange: (partial: Partial<AnalyzeInput>) => void;
  onPreset: (preset: Preset) => void;
  onFileError: (message: string) => void;
  onReset: () => void;
  onExport: (kind: "markdown" | "json") => void;
}

async function readUtf8(file: File, limit: number, label: string): Promise<string | null> {
  if (file.size > limit) {
    throw new Error(`${label} is ${file.size} bytes. The limit is ${limit} bytes, so the file was not read.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8 and was not read.`);
  }
}

export function InputsPanel({ inputs, onChange, onPreset, onFileError, onReset, onExport }: InputsPanelProps) {
  async function onHexFile(file: File | undefined, key: "requestText" | "responseText", label: string) {
    if (!file) {
      return;
    }
    try {
      const text = await readUtf8(file, MAX_HEX_TEXT_BYTES, label);
      if (text !== null) {
        onChange({ [key]: text });
      }
    } catch (error) {
      onFileError(error instanceof Error ? error.message : "The file could not be read.");
    }
  }

  async function onMapFile(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const text = await readUtf8(file, MAX_MAP_TEXT_BYTES, "Register map file");
      if (text !== null) {
        onChange({ mapText: text });
      }
    } catch (error) {
      onFileError(error instanceof Error ? error.message : "The map file could not be read.");
    }
  }

  return (
    <section className="panel" aria-labelledby="inputs-heading">
      <h2 id="inputs-heading">Inputs</h2>
      <p className="lede">
        Paste one Modbus TCP application data unit in each box, or load a UTF-8 text file. These are application bytes
        (MBAP + PDU) without Ethernet, IP, or TCP headers. Direction is the box you use.
      </p>
      <h3>Synthetic presets</h3>
      <ul className="preset-list">
        {PRESETS.map((preset) => (
          <li key={preset.id}>
            <button type="button" className="preset" onClick={() => onPreset(preset)} aria-pressed={inputs.syntheticPresetId === preset.id}>
              {preset.label}
            </button>
            <p>{preset.description}</p>
          </li>
        ))}
      </ul>
      <div className="field">
        <label htmlFor="request-hex">Request hex</label>
        <textarea
          id="request-hex"
          value={inputs.requestText}
          onChange={(event) => onChange({ requestText: event.target.value })}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={4}
          aria-describedby="request-help"
        />
        <p id="request-help">One function 03 or 04 request. Upper or lower case hex and ASCII whitespace are accepted.</p>
        <label htmlFor="request-file">Request file</label>
        <input
          id="request-file"
          type="file"
          accept=".txt,.hex,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onHexFile(file, "requestText", "Request file");
            event.target.value = "";
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="response-hex">Response hex</label>
        <textarea
          id="response-hex"
          value={inputs.responseText}
          onChange={(event) => onChange({ responseText: event.target.value })}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={4}
          aria-describedby="response-help"
        />
        <p id="response-help">One normal 03/04 response or exception 83/84. Leave empty to inspect a request alone.</p>
        <label htmlFor="response-file">Response file</label>
        <input
          id="response-file"
          type="file"
          accept=".txt,.hex,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onHexFile(file, "responseText", "Response file");
            event.target.value = "";
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="register-map">Register map JSON</label>
        <textarea
          id="register-map"
          value={inputs.mapText}
          onChange={(event) => onChange({ mapText: event.target.value })}
          spellCheck={false}
          rows={8}
          aria-describedby="map-help"
        />
        <p id="map-help">
          Schema version 1. Selectors are unitId, functionCode, and address. Labels never change the address. Empty means no map.
        </p>
        <label htmlFor="map-file">Register map file</label>
        <input
          id="map-file"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onMapFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => downloadText("register-lens-map-template.json", TEACHING_MAP_JSON, "application/json")}
        >
          Download map template
        </button>
      </div>
      <div className="field">
        <label htmlFor="capture-time">Capture time (optional, unverified)</label>
        <input
          id="capture-time"
          type="text"
          value={inputs.captureTime}
          onChange={(event) => onChange({ captureTime: event.target.value })}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="provenance-note">Provenance note (optional, unverified)</label>
        <textarea
          id="provenance-note"
          value={inputs.provenanceNote}
          onChange={(event) => onChange({ provenanceNote: event.target.value })}
          rows={2}
        />
      </div>
      <div className="actions">
        <button type="submit">Decode</button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
        <button type="button" onClick={() => onExport("markdown")}>
          Export Markdown
        </button>
        <button type="button" onClick={() => onExport("json")}>
          Export JSON
        </button>
      </div>
    </section>
  );
}
