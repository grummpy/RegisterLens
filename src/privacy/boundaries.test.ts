import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document.cookie",
  "sendBeacon",
  "WebSocket",
  "XMLHttpRequest",
  "fetch(",
  "EventSource",
  "google-analytics",
  "googletagmanager",
  "sentry.io",
  "https://",
  "http://",
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path);
    }
    return path;
  });
}

describe("offline boundaries", () => {
  it("keeps application source free of network, storage, and remote URLs", () => {
    const files = [...filesUnder("src"), "index.html", "public/favicon.svg"].filter(
      (path) => /\.(ts|tsx|css|html|svg)$/.test(path) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"),
    );
    const offenders: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, "utf8").replaceAll("http://www.w3.org/2000/svg", "");
      for (const token of FORBIDDEN) {
        if (text.includes(token)) {
          offenders.push(`${path}: ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
