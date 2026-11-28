/**
 * Peak-memory sampler for the PDF probe (D5-A4). Linux only; everywhere else (and whenever a file
 * cannot be read) the value is `null` instead of an error.
 *
 * Why not just process.resourceUsage(): Chromium runs as CHILD processes, so Node's own RSS misses
 * almost all of the memory. Two views are sampled every few milliseconds:
 *
 *   - chromiumRssPeakBytes  the summed VmRSS of all our descendant processes (/proc). Shared pages
 *                           are counted once per process, so this OVERSTATES — an upper bound.
 *   - cgroupPeakBytes       /sys/fs/cgroup/memory.current of the container: exactly what Docker's
 *                           mem_limit counts (worker + probe + Chromium). The number that decides.
 *
 * `cgroupLimitBytes` is memory.max (the mem_limit), `cgroupPeakSinceStartBytes` the kernel's own
 * high-water mark since the container started (memory.peak; exact, but not only our run).
 * Sampling can miss a spike shorter than the interval; memory.peak cannot.
 */
import { readdirSync, readFileSync } from "node:fs";

export type MemoryPeak = {
  nodeRssPeakBytes: number;
  chromiumRssPeakBytes: number | null;
  cgroupPeakBytes: number | null;
  cgroupLimitBytes: number | null;
  cgroupPeakSinceStartBytes: number | null;
};

export type SamplerOptions = {
  intervalMs?: number;
  rootPid?: number;
  procDir?: string;
  cgroupDir?: string;
};

/** The parent pid from /proc/<pid>/stat. The process name may contain spaces and ")". */
export function parseStatPpid(stat: string): number | null {
  const afterName = stat.slice(stat.lastIndexOf(")") + 1).trim();
  const ppid = Number(afterName.split(/\s+/)[1]);
  return Number.isInteger(ppid) ? ppid : null;
}

/** "VmRSS:   12345 kB" from /proc/<pid>/status → bytes. Kernel threads have no such line. */
export function parseVmRssBytes(status: string): number | null {
  const kb = /^VmRSS:\s+(\d+)\s+kB/m.exec(status)?.[1];
  return kb === undefined ? null : Number(kb) * 1024;
}

/** A cgroup v2 memory file: a number of bytes, or "max" (no limit) → null. */
export function parseCgroupBytes(text: string): number | null {
  const value = text.trim();
  return /^\d+$/.test(value) ? Number(value) : null;
}

/** Every pid below `root` in a pid → parent pid map (children, their children, …). */
export function descendantsOf(
  root: number,
  parents: Map<number, number>,
): number[] {
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [pid, ppid] of parents) {
      if (ppid === current) {
        found.push(pid);
        queue.push(pid);
      }
    }
  }
  return found;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null; // not Linux, no cgroup v2, or the process ended between listing and reading
  }
}

function descendantsRssBytes(procDir: string, rootPid: number): number | null {
  let entries: string[];
  try {
    entries = readdirSync(procDir);
  } catch {
    return null;
  }
  const parents = new Map<number, number>();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = readOrNull(`${procDir}/${entry}/stat`);
    const ppid = stat === null ? null : parseStatPpid(stat);
    if (ppid !== null) parents.set(Number(entry), ppid);
  }
  if (!parents.has(rootPid)) return null; // no usable /proc
  let total = 0;
  for (const pid of descendantsOf(rootPid, parents)) {
    const status = readOrNull(`${procDir}/${pid}/status`);
    total += (status === null ? null : parseVmRssBytes(status)) ?? 0;
  }
  return total;
}

const maxOrNull = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/** Starts sampling; `stop()` takes a last sample and returns the peaks. */
export function startMemorySampler(options: SamplerOptions = {}): {
  stop: () => MemoryPeak;
} {
  const {
    intervalMs = 25,
    rootPid = process.pid,
    procDir = "/proc",
    cgroupDir = "/sys/fs/cgroup",
  } = options;
  const cgroup = (file: string) => {
    const text = readOrNull(`${cgroupDir}/${file}`);
    return text === null ? null : parseCgroupBytes(text);
  };

  let nodeRss = 0;
  let chromiumRss: number | null = null;
  let cgroupCurrent: number | null = null;
  const sample = () => {
    nodeRss = Math.max(nodeRss, process.memoryUsage.rss());
    chromiumRss = maxOrNull(chromiumRss, descendantsRssBytes(procDir, rootPid));
    cgroupCurrent = maxOrNull(cgroupCurrent, cgroup("memory.current"));
  };

  sample();
  const timer = setInterval(sample, intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
      sample();
      return {
        nodeRssPeakBytes: nodeRss,
        chromiumRssPeakBytes: chromiumRss,
        cgroupPeakBytes: cgroupCurrent,
        cgroupLimitBytes: cgroup("memory.max"),
        cgroupPeakSinceStartBytes: cgroup("memory.peak"),
      };
    },
  };
}
