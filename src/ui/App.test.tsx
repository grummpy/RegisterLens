import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function decoded() {
  return screen.getByRole("region", { name: "Decoded" });
}

describe("Register Lens UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes the synthetic holding-register preset and links bytes to fields", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    const panel = decoded();
    expect(within(panel).getByRole("button", { name: /Register word 0, address 100, value 25\.3 °C/ })).toBeInTheDocument();
    expect(within(panel).getAllByText(/6 \+ 6 = 12/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/only because the map/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Request byte 8, hex 00, Starting address/ }));
    expect(screen.getByRole("button", { name: /Request Starting address/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Request byte 9, hex 64, Starting address/ })).toHaveAttribute(
      "data-in-range",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /Response Register word 0/ }));
    expect(screen.getByRole("button", { name: /Response byte 10, hex FD, Register word 0/ })).toHaveAttribute(
      "data-in-range",
      "true",
    );
  });

  it("moves byte selection with the keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    const start = screen.getByRole("button", { name: /Request byte 7, hex 03, Function code/ });
    start.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Request byte 8, hex 00, Starting address/ })).toHaveFocus();
  });

  it("clears stale values when the map changes, then decodes the raw word", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    expect(within(decoded()).getByRole("button", { name: /value 25\.3 °C/ })).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Register map JSON" }));
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3 °C/ })).not.toBeInTheDocument();
    expect(within(decoded()).getByText(/will stay hidden until decoding succeeds/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(within(decoded()).getByRole("button", { name: /meaning unknown/ })).toHaveTextContent("253");
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3 °C/ })).not.toBeInTheDocument();
  });

  it("resets inputs and results", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox", { name: "Request hex" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Response hex" })).toHaveValue("");
    expect(within(decoded()).getByText(/Paste a request/)).toBeInTheDocument();
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3/ })).not.toBeInTheDocument();
  });

  it("recovers from invalid hex", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Request hex" }), "ZZ");
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/index 0/);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(decoded()).getByRole("button", { name: /value 25\.3 °C/ })).toBeInTheDocument();
  });

  it("shows the signed example, an exception, unknown mapping, and a transaction mismatch", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Input registers and signed values" }));
    expect(within(decoded()).getByRole("button", { name: /value -10 °C/ })).toBeInTheDocument();
    expect(within(decoded()).getAllByText(/unit unknown/i).length).toBeGreaterThan(0);
    expect(within(decoded()).getByRole("button", { name: /Register word 1, address 1, value 200/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Synthetic: Exception illegal data address" }));
    expect(within(decoded()).getAllByText(/Illegal Data Address/).length).toBeGreaterThan(0);
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Synthetic: Unknown mapping" }));
    expect(within(decoded()).getAllByText(/No map entry matches/).length).toBeGreaterThan(0);
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Synthetic: Mismatched transaction" }));
    expect(within(decoded()).getByText(/does not match response 99/)).toBeInTheDocument();
    expect(within(decoded()).queryByRole("button", { name: /value 25\.3/ })).not.toBeInTheDocument();
  });

  it("exports JSON and Markdown for the current decode", async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    await user.click(screen.getByRole("button", { name: "Export Markdown" }));
    expect(blobs).toHaveLength(2);
    const json = await blobs[0]?.text();
    const markdown = await blobs[1]?.text();
    expect(json).toContain("\"schemaVersion\": 1");
    expect(json).toContain("25.3");
    expect(json).toContain("generatedAt");
    expect(json).toContain("captureTime");
    expect(markdown).toContain("not a chain of custody");
    expect(markdown).toContain("25.3");
  });

  it("offers selectable text when the clipboard refuses", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    await user.click(screen.getByRole("button", { name: "Copy explanation" }));
    expect((screen.getByLabelText("Selectable text") as HTMLTextAreaElement).value).toContain("25.3");
    expect(screen.getByText(/was not copied automatically/)).toBeInTheDocument();
    expect(screen.queryByText("Copied.")).not.toBeInTheDocument();
  });

  it("loads a request file and rejects an oversized file before reading it", async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File(["00 01 00 00 00 06 01 03 00 64 00 01"], "request.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Request file"), file);
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Request hex" })).toHaveValue(
        "00 01 00 00 00 06 01 03 00 64 00 01",
      );
    });
    const oversized = new File([new Uint8Array(9000)], "big.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Request file"), oversized);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/8192/);
    });
    expect(screen.getByRole("textbox", { name: "Request hex" })).toHaveValue(
      "00 01 00 00 00 06 01 03 00 64 00 01",
    );
  });

  it("renders hostile map text as text", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Synthetic: Holding register temperature" }));
    const map = screen.getByRole("textbox", { name: "Register map JSON" });
    const hostile = (map as HTMLTextAreaElement).value.replace("Demo temperature", "<img src=x onerror=alert(1)>");
    await user.clear(map);
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(within(decoded()).queryByText("25.3")).not.toBeInTheDocument();
    await user.click(map);
    map.focus();
    await user.paste(hostile);
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(document.querySelector("img")).toBeNull();
    expect(within(decoded()).getAllByText(/<img src=x onerror=alert\(1\)>/).length).toBeGreaterThan(0);
  });
});
