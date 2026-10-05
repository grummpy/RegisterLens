import type { AnalysisResult } from "../analysis/analyze";
import type { Diagnostic } from "../protocol/diagnostics";
import { StatusMark } from "./StatusMark";
import type { Selection } from "./fields";

interface DecodedPanelProps {
  result: AnalysisResult | null;
  dirty: boolean;
  selection: Selection | null;
  inputErrors: string[];
  copyNote: string | null;
  copyFallback: string | null;
  onSelectField: (message: "request" | "response", fieldId: string) => void;
  onSelectRegister: (fieldId: string) => void;
  onCopy: (text: string) => void;
}

function errorDiagnostics(result: AnalysisResult | null): Diagnostic[] {
  if (!result) {
    return [];
  }
  return [
    ...result.inputDiagnostics,
    ...(result.request?.diagnostics ?? []),
    ...(result.response?.diagnostics ?? []),
    ...result.map.diagnostics,
    ...result.registers.flatMap((register) => register.diagnostics),
  ].filter((item) => item.severity === "error");
}

function warningDiagnostics(result: AnalysisResult | null): Diagnostic[] {
  if (!result) {
    return [];
  }
  return [...result.pairing.diagnostics, ...(result.request?.diagnostics ?? []), ...(result.response?.diagnostics ?? [])].filter(
    (item) => item.severity === "warning" || item.severity === "info",
  );
}

export function DecodedPanel({
  result,
  dirty,
  selection,
  inputErrors,
  copyNote,
  copyFallback,
  onSelectField,
  onSelectRegister,
  onCopy,
}: DecodedPanelProps) {
  const errors = errorDiagnostics(result);
  const warnings = warningDiagnostics(result);
  const summary = summarize(result, dirty);

  return (
    <section className="panel" id="decoded" aria-labelledby="decoded-heading">
      <h2 id="decoded-heading">Decoded</h2>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      {(inputErrors.length > 0 || errors.length > 0) && (
        <div role="alert" className="callout callout-error">
          <h3>Validation</h3>
          <ul>
            {inputErrors.map((message, index) => (
              <li key={`input-${index}`}>{message}</li>
            ))}
            {errors.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <span className="code">{item.code}</span> {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="callout callout-warn">
          <h3>Notes</h3>
          <ul>
            {warnings.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <span className="code">{item.code}</span> {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!result && !dirty && (
        <div className="empty">
          <p>Empty. Paste a request, a response, or both, then choose Decode. Presets decode immediately and are marked Synthetic.</p>
        </div>
      )}
      {!result && dirty && (
        <p role="status" className="callout">
          Inputs changed. Stale results were cleared and will stay hidden until decoding succeeds.
        </p>
      )}
      {result && (
        <>
          <div className="status-row">
            <span>Request <StatusMark status={result.request?.status ?? "empty"} /></span>
            <span>Response <StatusMark status={result.response?.status ?? "empty"} /></span>
            <span>Exchange <StatusMark status={result.pairing.status} /></span>
            <span>Map <StatusMark status={result.map.status} /></span>
          </div>
          {result.syntheticPreset && <p className="synthetic">Preset: {result.syntheticPreset.label}. Synthetic example.</p>}
          {result.map.map && (
            <p>
              Map “{result.map.map.name}”, version {result.map.map.mapVersion}. Source: {result.map.map.source}
            </p>
          )}
          <div className="copy-row">
            <button type="button" onClick={() => onCopy(result.request?.normalizedHex ?? result.request?.originalText ?? "")}>
              Copy request hex
            </button>
            <button type="button" onClick={() => onCopy(result.response?.normalizedHex ?? result.response?.originalText ?? "")}>
              Copy response hex
            </button>
            <button type="button" onClick={() => onCopy(result.explanations.join("\n\n"))}>
              Copy explanation
            </button>
          </div>
          {copyNote && <p role="status">{copyNote}</p>}
          {copyFallback !== null && (
            <div>
              <p id="copy-fallback-note">Clipboard is unavailable. Select the text below. It was not copied automatically.</p>
              <textarea readOnly value={copyFallback} aria-label="Selectable text" aria-describedby="copy-fallback-note" rows={4} />
            </div>
          )}
          <h3>Plain-language explanation</h3>
          {result.explanations.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <h3>Fields</h3>
          <FieldList message="request" result={result} selection={selection} onSelectField={onSelectField} />
          <FieldList message="response" result={result} selection={selection} onSelectField={onSelectField} />
          <h3>Register values</h3>
          {result.registers.length === 0 ? (
            <p>No register values. Exceptions, unmatched frames, and malformed responses do not produce engineering values.</p>
          ) : (
            <ul className="register-list">
              {result.registers.map((register) => {
                const selected = selection?.message === "response" && selection.fieldId === register.fieldId;
                return (
                  <li key={register.fieldId}>
                    <button
                      type="button"
                      className="register"
                      aria-pressed={selected}
                      aria-label={`Register word ${register.wordIndex}, ${
                        register.address === null ? "address unknown" : `address ${register.address}`
                      }, ${
                        register.engineering
                          ? `value ${register.engineering.display} ${register.unitStatement}`
                          : "meaning unknown"
                      }`}
                      onClick={() => onSelectRegister(register.fieldId)}
                    >
                      <span className="kicker">Word {register.wordIndex}</span>
                      <span className="kicker">Wire address</span>
                      <strong className="address">
                        {register.address === null ? "Unknown" : `${register.address} / ${register.addressHex}`}
                      </strong>
                      {register.displayAddress && (
                        <span>Documentation label {register.displayAddress}, not a wire address.</span>
                      )}
                      {register.documentationLabel && <span>Label: {register.documentationLabel}</span>}
                      <span className="kicker">Unsigned raw {register.rawHex}</span>
                      <strong>{register.rawUnsigned}</strong>
                      {register.typed && (
                        <span>
                          Typed {register.typed.type}: {register.typed.value}
                        </span>
                      )}
                      {register.engineering ? (
                        <>
                          <span className="kicker">Explicit map value</span>
                          <strong className="register-value">
                            {register.engineering.display} {register.unitStatement}
                          </strong>
                          <span>Formula {register.engineering.formula}</span>
                          <span>
                            Display rounding: shown to 6 decimal digits. Internal value {register.engineering.internal} is unrounded.
                          </span>
                        </>
                      ) : (
                        <strong>Meaning unknown</strong>
                      )}
                      <span>{register.unitStatement === "unit unknown" ? "Unit unknown." : `Unit ${register.unitStatement}.`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FieldList({
  message,
  result,
  selection,
  onSelectField,
}: {
  message: "request" | "response";
  result: AnalysisResult;
  selection: Selection | null;
  onSelectField: (message: "request" | "response", fieldId: string) => void;
}) {
  const decoded = message === "request" ? result.request : result.response;
  if (!decoded || decoded.fields.length === 0) {
    return null;
  }
  const heading = message === "request" ? "Request fields" : "Response fields";
  return (
    <div>
      <h4>{heading}</h4>
      <ul className="field-list">
        {decoded.fields.map((field) => {
          const selected = selection?.message === message && selection.fieldId === field.id;
          return (
            <li key={field.id}>
              <button
                type="button"
                className="field-button"
                aria-pressed={selected}
                aria-label={`${message === "request" ? "Request" : "Response"} ${field.name}, bytes ${field.byteStart}–${field.byteEnd}, ${field.parsedValue}`}
                onClick={() => onSelectField(message, field.id)}
              >
                <span className="kicker">
                  Bytes {field.byteStart}–{field.byteEnd}
                </span>
                <strong>{field.name}</strong>
                <span>Raw {field.rawHex}</span>
                <span>Parsed {field.parsedValue}</span>
                <span>{field.explanation}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function summarize(result: AnalysisResult | null, dirty: boolean): string {
  if (!result) {
    return dirty ? "Stale results were cleared." : "Empty. Nothing decoded yet.";
  }
  return `Request ${result.request?.status ?? "empty"}. Response ${result.response?.status ?? "empty"}. Exchange ${result.pairing.status}. Map ${result.map.status}.`;
}
