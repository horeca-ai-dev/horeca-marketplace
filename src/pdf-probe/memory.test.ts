import { describe, expect, it } from "vitest";
import {
  descendantsOf,
  parseCgroupBytes,
  parseStatPpid,
  parseVmRssBytes,
  startMemorySampler,
} from "./memory";

describe("parseStatPpid", () => {
  it("reads the parent pid", () => {
    expect(parseStatPpid("42 (node) S 7 42 42 0 -1")).toBe(7);
  });

  it("survives spaces and brackets in the process name", () => {
    expect(parseStatPpid("42 (chrome (x) y) S 13 42 42 0 -1")).toBe(13);
  });

  it("is null for garbage", () => {
    expect(parseStatPpid("")).toBeNull();
  });
});

describe("parseVmRssBytes", () => {
  it("converts kB to bytes", () => {
    expect(parseVmRssBytes("Name:\tnode\nVmRSS:\t    2048 kB\n")).toBe(
      2048 * 1024,
    );
  });

  it("is null without the line (kernel thread)", () => {
    expect(parseVmRssBytes("Name:\tkthreadd\n")).toBeNull();
  });
});

describe("parseCgroupBytes", () => {
  it("reads a number and treats 'max' as no limit", () => {
    expect(parseCgroupBytes("805306368\n")).toBe(805306368);
    expect(parseCgroupBytes("max\n")).toBeNull();
  });
});

describe("descendantsOf", () => {
  it("returns children and grandchildren, not siblings or the root", () => {
    const parents = new Map([
      [1, 0],
      [10, 1],
      [11, 10],
      [12, 11],
      [20, 1],
    ]);
    expect(descendantsOf(10, parents).sort()).toEqual([11, 12]);
  });
});

describe("startMemorySampler", () => {
  it("reports nulls, not an error, where /proc and the cgroup files do not exist", () => {
    const peak = startMemorySampler({
      procDir: "/nonexistent-proc",
      cgroupDir: "/nonexistent-cgroup",
    }).stop();
    expect(peak.nodeRssPeakBytes).toBeGreaterThan(0);
    expect(peak.chromiumRssPeakBytes).toBeNull();
    expect(peak.cgroupPeakBytes).toBeNull();
    expect(peak.cgroupLimitBytes).toBeNull();
    expect(peak.cgroupPeakSinceStartBytes).toBeNull();
  });
});
