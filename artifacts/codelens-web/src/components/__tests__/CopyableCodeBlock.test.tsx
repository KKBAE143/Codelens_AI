import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyableCodeBlock } from "@/components/CopyableCodeBlock";

describe("CopyableCodeBlock", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders code content", () => {
    render(<CopyableCodeBlock code="console.log('hello')" language="ts" />);
    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
  });

  it("shows language label when provided", () => {
    render(<CopyableCodeBlock code="print('hi')" language="python" />);
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("shows filename when provided", () => {
    render(<CopyableCodeBlock code="x = 1" filename="main.py" />);
    expect(screen.getByText("main.py")).toBeInTheDocument();
  });

  it("has a copy button with correct accessible name", () => {
    render(<CopyableCodeBlock code="test" />);
    const button = screen.getByRole("button", { name: /copy to clipboard/i });
    expect(button).toHaveAccessibleName("Copy to clipboard");
  });

  it("shows 'Copied' feedback after button click", async () => {
    render(<CopyableCodeBlock code="test" />);
    const button = screen.getByRole("button", { name: /copy to clipboard/i });
    await userEvent.click(button);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(button).toHaveTextContent("Copied");
    expect(button).toHaveAccessibleName("Copied to clipboard");
  });

  it("resets 'Copied' state after 2 seconds", async () => {
    render(<CopyableCodeBlock code="test" />);
    const button = screen.getByRole("button", { name: /copy to clipboard/i });
    await userEvent.click(button);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(button).toHaveTextContent("Copied");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2050));
    });
    expect(button).toHaveTextContent("Copy");
    expect(button).toHaveAccessibleName("Copy to clipboard");
  });

  it("supports keyboard Enter to copy", async () => {
    render(<CopyableCodeBlock code="test" />);
    const button = screen.getByRole("button", { name: /copy to clipboard/i });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(button).toHaveTextContent("Copied");
  });

  it("supports keyboard Space to copy", async () => {
    render(<CopyableCodeBlock code="test" />);
    const button = screen.getByRole("button", { name: /copy to clipboard/i });
    button.focus();
    await userEvent.keyboard(" ");
    expect(button).toHaveTextContent("Copied");
  });
});
