import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Controls what the components see for the "reduce motion" setting.
const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => motionPref.reduce };
});

const { NumberTicker } = await import("../components/magicui/number-ticker");
const { BlurFade } = await import("../components/magicui/blur-fade");
const { Highlighter } = await import("../components/magicui/highlighter");

describe("Magic UI effects with reduce motion ON", () => {
  it("Number Ticker shows the exact final amount as plain text", () => {
    motionPref.reduce = true;
    const html = renderToStaticMarkup(<NumberTicker value={119515.24} decimalPlaces={2} prefix="$" />);
    expect(html).toBe("<span>$119,515.24</span>");
  });

  it("Blur Fade renders its content with no animation styles", () => {
    motionPref.reduce = true;
    const html = renderToStaticMarkup(<BlurFade>Saved to the sheet</BlurFade>);
    expect(html).toBe("<div>Saved to the sheet</div>");
  });

  it("Text Highlighter falls back to a plain <mark>", () => {
    motionPref.reduce = true;
    const html = renderToStaticMarkup(<Highlighter>Rivera</Highlighter>);
    expect(html).toMatch(/^<mark style="[^"]*background:#d6e1fa[^"]*">Rivera<\/mark>$/);
  });
});

describe("Magic UI effects with reduce motion OFF", () => {
  it("Number Ticker starts at the formatted final value (no count-up from 0) and labels it for screen readers", () => {
    motionPref.reduce = false;
    const html = renderToStaticMarkup(<NumberTicker value={2353.71} decimalPlaces={2} prefix="$" />);
    expect(html).toContain('aria-label="$2,353.71"');
    expect(html).toContain('aria-hidden="true">$2,353.71</span>');
    expect(html).not.toContain(">0<");
  });

  it("Number Ticker formats counts without decimals or a $ sign", () => {
    motionPref.reduce = false;
    expect(renderToStaticMarkup(<NumberTicker value={1234} />)).toContain(">1,234</span>");
  });

  it("Blur Fade starts slightly lower, transparent and blurred", () => {
    motionPref.reduce = false;
    const html = renderToStaticMarkup(<BlurFade>Draft</BlurFade>);
    expect(html).toContain("opacity:0");
    expect(html).toContain("blur(4px)");
  });

  it("Text Highlighter wraps the match so its drawing stays inside the cell", () => {
    motionPref.reduce = false;
    expect(renderToStaticMarkup(<Highlighter>Rivera</Highlighter>)).toBe('<span class="cbt-highlight"><span>Rivera</span></span>');
  });
});
