import type { KeyboardEvent } from "react";
import type { MessageDecode } from "../protocol/types";
import { toHexByte } from "../protocol/bytes";
import { fieldAt, type Selection } from "./fields";

interface ByteViewProps {
  request: MessageDecode | null;
  response: MessageDecode | null;
  selection: Selection | null;
  onSelectByte: (message: "request" | "response", byteIndex: number) => void;
}

export function ByteView({ request, response, selection, onSelectByte }: ByteViewProps) {
  return (
    <section className="panel" aria-labelledby="bytes-heading">
      <h2 id="bytes-heading">Bytes</h2>
      <p>Select a byte or use the arrow keys. The matching field highlights in both panels.</p>
      <ul className="legend">
        <li><span className="swatch swatch-mbap" /> MBAP header, solid underline</li>
        <li><span className="swatch swatch-pdu" /> PDU, dashed underline</li>
        <li><span className="swatch swatch-register" /> Register value, double underline</li>
        <li><span className="swatch swatch-exception" /> Exception, dotted underline</li>
        <li><span className="swatch swatch-selected" /> Selected range, gold fill</li>
      </ul>
      <ByteStrip title="Request bytes" message="request" decoded={request} selection={selection} onSelectByte={onSelectByte} />
      <ByteStrip title="Response bytes" message="response" decoded={response} selection={selection} onSelectByte={onSelectByte} />
    </section>
  );
}

function ByteStrip({
  title,
  message,
  decoded,
  selection,
  onSelectByte,
}: {
  title: string;
  message: "request" | "response";
  decoded: MessageDecode | null;
  selection: Selection | null;
  onSelectByte: (message: "request" | "response", byteIndex: number) => void;
}) {
  const bytes = decoded?.bytes ?? [];
  const selectedField =
    selection?.message === message && selection.fieldId
      ? decoded?.fields.find((field) => field.id === selection.fieldId) ?? null
      : null;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") {
      next = Math.min(bytes.length - 1, index + 1);
    } else if (event.key === "ArrowLeft") {
      next = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = bytes.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    onSelectByte(message, next);
    document.getElementById(`${message}-byte-${next}`)?.focus();
  }

  return (
    <div className="strip">
      <h3>{title}</h3>
      {decoded?.normalizedHex ? (
        <>
          <p className="raw-label">Normalized hex</p>
          <pre>{decoded.normalizedHex}</pre>
        </>
      ) : (
        <p>No validated bytes yet.</p>
      )}
      <div className="byte-grid" role="group" aria-label={title}>
        {bytes.map((byte, index) => {
          const owner = fieldAt(decoded?.fields ?? [], index);
          const inRange =
            selectedField !== null && index >= selectedField.byteStart && index <= selectedField.byteEnd;
          const pressed = selection?.message === message && selection.byteIndex === index;
          const hex = toHexByte(byte);
          const roleLabel = message === "request" ? "Request" : "Response";
          return (
            <button
              key={`${message}-${index}`}
              id={`${message}-byte-${index}`}
              type="button"
              className="byte"
              data-kind={owner?.kind ?? "raw"}
              data-in-range={inRange ? "true" : "false"}
              aria-pressed={pressed || inRange}
              aria-label={`${roleLabel} byte ${index}, hex ${hex}, ${owner?.name ?? "no validated field"}`}
              onClick={() => onSelectByte(message, index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="byte-offset">{index.toString(16).toUpperCase().padStart(2, "0")}</span>
              <span className="byte-hex">{hex}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
