import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

function trackLoopback(external: string[]) {
  return async (route: Route) => {
    const url = new URL(route.request().url());
    const host = url.hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
      await route.continue();
      return;
    }
    external.push(url.href);
    await route.abort("blockedbyclient");
  };
}

async function assertLocalResources(page: Page) {
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  for (const resource of resources) {
    const host = new URL(resource).hostname;
    expect(["127.0.0.1", "localhost", "::1"]).toContain(host);
  }
  const scriptSrc = await page.locator("script[type='module']").first().getAttribute("src");
  expect(scriptSrc).toBeTruthy();
  const script = await page.evaluate(async (src) => {
    const response = await fetch(src as string);
    return response.text();
  }, scriptSrc);
  expect(script).not.toMatch(/google-analytics|googletagmanager|sentry\.io|segment\.com|mixpanel/);
}

test.describe("production build on loopback", () => {
  test("decodes both worked examples, recovers, exports, and stays offline", async ({ page }) => {
    const external: string[] = [];
    await page.route("**/*", trackLoopback(external));
    await page.goto("/");
    await expect(page.getByRole("note")).toContainText("Educational offline analysis");

    await page.getByRole("button", { name: "Synthetic: Holding register temperature" }).click();
    const decoded = page.getByRole("region", { name: "Decoded" });
    await expect(decoded.getByRole("button", { name: /value 25\.3 °C/ })).toBeVisible();
    await expect(decoded).toContainText("253");
    await expect(decoded).toContainText("6 + 6 = 12");
    await page.getByRole("button", { name: /Response byte 10, hex FD/ }).click();
    await expect(page.getByRole("button", { name: /Register word 0, address 100, value 25\.3/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Synthetic: Input registers and signed values" }).click();
    await expect(decoded.getByRole("button", { name: /value -10 °C/ })).toBeVisible();
    await expect(decoded.getByRole("button", { name: /value 200 unit unknown/ })).toBeVisible();

    await page.getByRole("textbox", { name: "Request hex" }).fill("ZZ");
    await page.getByRole("button", { name: "Decode" }).click();
    await expect(page.getByRole("alert")).toContainText(/index/i);
    await page.getByRole("button", { name: "Synthetic: Holding register temperature" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(decoded.getByRole("button", { name: /value 25\.3 °C/ })).toBeVisible();

    const teachingMap = {
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
    await page.getByLabel("Request file").setInputFiles({
      name: "request.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("00 01 00 00 00 06 01 03 00 64 00 01"),
    });
    await expect(page.getByRole("textbox", { name: "Request hex" })).toHaveValue(
      "00 01 00 00 00 06 01 03 00 64 00 01",
    );
    await page.getByLabel("Response file").setInputFiles({
      name: "response.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("00 01 00 00 00 05 01 03 02 00 FD"),
    });
    await expect(page.getByRole("textbox", { name: "Response hex" })).toHaveValue(
      "00 01 00 00 00 05 01 03 02 00 FD",
    );
    await page.getByLabel("Register map file").setInputFiles({
      name: "map.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(teachingMap)),
    });
    await expect(page.getByRole("textbox", { name: "Register map JSON" })).toHaveValue(JSON.stringify(teachingMap));
    await page.getByRole("button", { name: "Decode" }).click();
    await expect(decoded.getByRole("button", { name: /value 25\.3 °C/ })).toBeVisible();

    const jsonDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const jsonFile = await jsonDownload;
    const jsonPath = await jsonFile.path();
    expect(jsonPath).toBeTruthy();
    const json = readFileSync(jsonPath as string, "utf8");
    expect(json).toContain("25.3");
    expect(json).toContain("generatedAt");
    expect(json).toContain("captureTime");
    expect(json).toContain("not a chain of custody");

    const mdDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Markdown" }).click();
    const mdFile = await mdDownload;
    const markdown = readFileSync((await mdFile.path()) as string, "utf8");
    expect(markdown).toContain("25.3");
    expect(markdown).toContain("Generated at:");
    expect(markdown).toContain("Capture time");

    await assertLocalResources(page);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test("stays usable at a 360px viewport and at 200% zoom", async ({ page }) => {
    const external: string[] = [];
    await page.route("**/*", trackLoopback(external));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Synthetic: Holding register temperature" }).click();
    const value = page.getByRole("button", { name: /Register word 0, address 100, value 25\.3 °C/ });
    await expect(value).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await page.getByRole("button", { name: "Decode" }).click();
    await expect(value).toBeVisible();
    expect(external).toEqual([]);
  });
});
