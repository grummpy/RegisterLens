const GLYPH: Record<string, string> = {
  valid: "●",
  exception: "▲",
  malformed: "×",
  unsupported: "■",
  unmatched: "◆",
  matched: "●",
  matched_exception: "▲",
  orphan_response: "○",
  request_only: "○",
  not_applicable: "–",
  absent: "–",
  invalid: "×",
  empty: "–",
};

const LABEL: Record<string, string> = {
  valid: "Valid",
  exception: "Exception",
  malformed: "Malformed",
  unsupported: "Unsupported",
  unmatched: "Unmatched",
  matched: "Matched",
  matched_exception: "Matched exception",
  orphan_response: "Orphan response",
  request_only: "Request only",
  not_applicable: "Not applicable",
  absent: "No map",
  invalid: "Map invalid",
  empty: "Empty",
};

export function StatusMark({ status }: { status: string }) {
  const glyph = GLYPH[status] ?? "•";
  const label = LABEL[status] ?? status;
  return (
    <span className={`status status-${status.replace(/_/g, "-")}`}>
      <span className="status-glyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </span>
  );
}
