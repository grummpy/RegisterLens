export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  byteRange?: { start: number; end: number };
  index?: number;
  path?: string;
}

export function diagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  extra?: Pick<Diagnostic, "byteRange" | "index" | "path">,
): Diagnostic {
  return { code, severity, message, ...extra };
}
