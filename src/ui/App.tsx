import { useState } from "react";
import { analyzeExchange, type AnalysisResult, type AnalyzeInput } from "../analysis/analyze";
import { DISCLAIMER } from "../copy";
import type { Preset } from "../presets";
import { buildEvidence, evidenceJson, renderMarkdown } from "../report/exportReport";
import { ByteView } from "./ByteView";
import { DecodedPanel } from "./DecodedPanel";
import { copyText, downloadText } from "./download";
import { fieldAt, type Selection } from "./fields";
import { InputsPanel } from "./InputsPanel";

const EMPTY: AnalyzeInput = {
  requestText: "",
  responseText: "",
  mapText: "",
  captureTime: "",
  provenanceNote: "",
  syntheticPresetId: null,
  syntheticPresetLabel: null,
};

export function App() {
  const [inputs, setInputs] = useState<AnalyzeInput>(EMPTY);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [inputErrors, setInputErrors] = useState<string[]>([]);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  const dirty = Boolean(
    inputs.requestText || inputs.responseText || inputs.mapText || inputs.captureTime || inputs.provenanceNote,
  );

  function update(partial: Partial<AnalyzeInput>) {
    setInputs((current) => ({
      ...current,
      ...partial,
      syntheticPresetId: null,
      syntheticPresetLabel: null,
    }));
    setResult(null);
    setSelection(null);
    setInputErrors([]);
    setCopyNote(null);
    setCopyFallback(null);
  }

  function decodeFrom(next: AnalyzeInput) {
    const analyzed = analyzeExchange(next);
    setResult(analyzed);
    setSelection(null);
    setCopyNote(null);
    setCopyFallback(null);
    return analyzed;
  }

  function onPreset(preset: Preset) {
    const next: AnalyzeInput = {
      requestText: preset.requestText,
      responseText: preset.responseText,
      mapText: preset.mapText,
      captureTime: "",
      provenanceNote: "Synthetic preset. Invented demonstration data; no real equipment.",
      syntheticPresetId: preset.id,
      syntheticPresetLabel: preset.label,
    };
    setInputs(next);
    setInputErrors([]);
    decodeFrom(next);
  }

  function onFileError(message: string) {
    setInputErrors([message]);
    setResult(null);
    setSelection(null);
  }

  function onExport(kind: "markdown" | "json") {
    const analyzed = result ?? decodeFrom(inputs);
    const report = buildEvidence(analyzed, new Date().toISOString());
    if (kind === "json") {
      downloadText("register-lens-evidence.json", evidenceJson(report), "application/json");
    } else {
      downloadText("register-lens-evidence.md", renderMarkdown(report), "text/markdown");
    }
  }

  async function onCopy(text: string) {
    const outcome = await copyText(text);
    if (outcome === "copied") {
      setCopyNote("Copied.");
      setCopyFallback(null);
      return;
    }
    setCopyNote(null);
    setCopyFallback(text);
  }

  return (
    <>
      <a className="skip" href="#decoded">
        Skip to decoded fields
      </a>
      <header className="masthead">
        <p className="eyebrow">Offline Modbus TCP decoder</p>
        <h1>Register Lens</h1>
        <p className="banner" role="note">
          {DISCLAIMER}
        </p>
      </header>
      <main className="layout">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            decodeFrom(inputs);
          }}
        >
          <InputsPanel
            inputs={inputs}
            onChange={update}
            onPreset={onPreset}
            onFileError={onFileError}
            onReset={() => {
              setInputs(EMPTY);
              setResult(null);
              setSelection(null);
              setInputErrors([]);
              setCopyNote(null);
              setCopyFallback(null);
            }}
            onExport={onExport}
          />
        </form>
        <ByteView
          request={result?.request ?? null}
          response={result?.response ?? null}
          selection={selection}
          onSelectByte={(message, byteIndex) => {
            const decoded = message === "request" ? result?.request : result?.response;
            const match = fieldAt(decoded?.fields ?? [], byteIndex);
            setSelection({ message, byteIndex, fieldId: match?.id ?? null });
          }}
        />
        <DecodedPanel
          result={result}
          dirty={dirty}
          selection={selection}
          inputErrors={inputErrors}
          copyNote={copyNote}
          copyFallback={copyFallback}
          onSelectField={(message, fieldId) => {
            const decoded = message === "request" ? result?.request : result?.response;
            const field = decoded?.fields.find((item) => item.id === fieldId);
            setSelection({ message, fieldId, byteIndex: field?.byteStart ?? null });
          }}
          onSelectRegister={(fieldId) => {
            const field = result?.response?.fields.find((item) => item.id === fieldId);
            setSelection({ message: "response", fieldId, byteIndex: field?.byteStart ?? null });
          }}
          onCopy={(text) => {
            void onCopy(text);
          }}
        />
      </main>
      <footer className="principles">
        <p>Industrial protocol</p>
        <p>Offline analysis</p>
        <p>Explicit map teaching</p>
        <p>No vendor lock-in</p>
        <p>See inside the bytes</p>
      </footer>
    </>
  );
}
