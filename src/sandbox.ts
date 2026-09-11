import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

export interface SandboxInfo {
  name: string;
  /** Host-visible workspace paths `sbx ls` reports for this sandbox. */
  workspaces: string[];
  /** `sbx` lifecycle status; only a running sandbox can execute anything. */
  status?: string;
}

export interface SandboxLookup {
  /** Lists sandboxes known to `sbx`. Returns `[]` when `sbx` is unavailable or reports none. */
  listSandboxes: () => SandboxInfo[];
}

/** Uses path semantics so sibling prefixes such as `/wt/a` and `/wt/ab` do not collide. */
function containsPath(outer: string, inner: string): boolean {
  const rel = relative(resolve(outer), resolve(inner));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Longest workspace of `s` that contains `path`, or undefined when none does. */
function matchDepth(s: SandboxInfo, path: string): number | undefined {
  const lengths = s.workspaces
    .filter((w) => w.length > 0 && containsPath(w, path))
    .map((w) => w.length);
  return lengths.length > 0 ? Math.max(...lengths) : undefined;
}

/**
 * Picks the running sandbox whose workspace contains `path`, preferring the most specific match.
 * Stopped sandboxes are skipped: `sbx exec` cannot reach them, so routing there would only turn a
 * usable local review into a failure.
 */
export function findSandboxForPath(path: string, sandboxes: SandboxInfo[]): string | undefined {
  let best: { name: string; depth: number } | undefined;
  for (const s of sandboxes) {
    if (s.status !== undefined && s.status !== "running") continue;
    const depth = matchDepth(s, path);
    if (depth === undefined) continue;
    if (!best || depth > best.depth) best = { name: s.name, depth };
  }
  return best?.name;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string" && v !== "");
  return typeof value === "string" && value !== "" ? [value] : [];
}

/**
 * Reads the `sbx ls --json` shape (`{sandboxes: [{name, status, workspaces: [...]}]}`), tolerating
 * a bare array and a singular `workspace` string, and degrades to no sandboxes rather than throw.
 */
export function parseSandboxList(value: unknown): SandboxInfo[] {
  const list = Array.isArray(value)
    ? value
    : value !== null &&
        typeof value === "object" &&
        Array.isArray((value as { sandboxes?: unknown }).sandboxes)
      ? (value as { sandboxes: unknown[] }).sandboxes
      : [];

  return list.flatMap((item): SandboxInfo[] => {
    if (typeof item !== "object" || item === null) return [];
    const fields = item as Record<string, unknown>;
    const name = fields.name ?? fields.sandbox;
    if (typeof name !== "string" || name === "") return [];
    const workspaces = [...asStringArray(fields.workspaces), ...asStringArray(fields.workspace)];
    return [
      { name, workspaces, status: typeof fields.status === "string" ? fields.status : undefined },
    ];
  });
}

/*
 * `sbx ls` costs a process spawn (~0.3s) and the launcher is resolved once per review action, so
 * memoize for the life of the process. Plugin entrypoints are short-lived, so a sandbox started
 * mid-process is not a case worth invalidating for.
 */
let cached: SandboxInfo[] | undefined;

export const realSandboxLookup: SandboxLookup = {
  listSandboxes: () => {
    if (cached) return cached;
    const r = spawnSync("sbx", ["ls", "--json"], { encoding: "utf8" });
    cached = r.status !== 0 || !r.stdout ? [] : parseSandboxList(JSON.parse(r.stdout));
    return cached;
  },
};
