import { describe, expect, it } from "vitest";
import {
  afterOpen,
  closeMode,
  openMode,
  type PanelEntry,
} from "./panel-history";

const LIST = "/buyer/company";
const A = "/buyer/company?open=a";
const B = "/buyer/company?open=b";

describe("openMode", () => {
  it("pushes when no panel is open, so Back closes it", () => {
    expect(openMode(null)).toBe("push");
  });
  it("replaces when switching from one row's panel to another", () => {
    expect(openMode("a")).toBe("replace");
  });
});

describe("afterOpen", () => {
  it("remembers the pushed entry", () => {
    expect(afterOpen(null, "push", A)).toEqual({ url: A });
  });
  it("keeps our entry (with the new URL) when switching rows", () => {
    expect(afterOpen({ url: A }, "replace", B)).toEqual({ url: B });
  });
  it("still has no entry after switching on a page loaded with ?open=", () => {
    expect(afterOpen(null, "replace", B)).toBeNull();
  });
});

describe("closeMode", () => {
  it("goes back when the panel's entry is ours", () => {
    expect(closeMode({ url: A }, A)).toBe("back");
  });
  it("replaces when the page was loaded with ?open= (no entry of ours)", () => {
    expect(closeMode(null, A)).toBe("replace");
  });
  it("replaces when our entry is stale (another URL is on screen)", () => {
    expect(closeMode({ url: A }, B)).toBe("replace");
  });
});

describe("a whole session", () => {
  // Replays the decisions the hook makes, with a fake history stack.
  function session() {
    let entry: PanelEntry = null;
    const stack = [LIST];
    const current = () => stack[stack.length - 1]!;
    const openId = () =>
      new URL(current(), "http://x").searchParams.get("open");
    return {
      stack,
      open(url: string) {
        const mode = openMode(openId());
        entry = afterOpen(entry, mode, url);
        if (mode === "push") stack.push(url);
        else stack[stack.length - 1] = url;
      },
      close() {
        const mode = closeMode(entry, current());
        entry = null;
        if (mode === "back") stack.pop();
        else stack[stack.length - 1] = LIST;
      },
    };
  }

  it("open a, switch to b, close: history is back to just the list", () => {
    const s = session();
    s.open(A);
    s.open(B);
    s.close();
    expect(s.stack).toEqual([LIST]);
  });

  it("loaded with ?open=a: closing replaces and leaves no extra entry", () => {
    const s = session();
    s.stack[0] = A;
    s.close();
    expect(s.stack).toEqual([LIST]);
  });
});
