import { describe, expect, it } from "vitest";
import { findSandboxForPath, parseSandboxList } from "../src/sandbox.js";

describe("findSandboxForPath", () => {
  it("matches a sandbox whose workspace is exactly the path", () => {
    expect(findSandboxForPath("/wt/project", [{ name: "s1", workspaces: ["/wt/project"] }])).toBe(
      "s1",
    );
  });

  it("matches a sandbox whose workspace is an ancestor of the path", () => {
    expect(
      findSandboxForPath("/wt/project/src/deep", [{ name: "s1", workspaces: ["/wt/project"] }]),
    ).toBe("s1");
  });

  it("does not mistake a sibling directory with a shared prefix for a child", () => {
    expect(
      findSandboxForPath("/wt/project-x", [{ name: "s1", workspaces: ["/wt/project"] }]),
    ).toBeUndefined();
  });

  it("ignores sandboxes with no workspace", () => {
    expect(findSandboxForPath("/wt/project", [{ name: "s1", workspaces: [] }])).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(
      findSandboxForPath("/wt/other", [{ name: "s1", workspaces: ["/wt/project"] }]),
    ).toBeUndefined();
  });

  it("skips a stopped sandbox even when its workspace matches", () => {
    expect(
      findSandboxForPath("/wt/project", [
        { name: "s1", workspaces: ["/wt/project"], status: "stopped" },
      ]),
    ).toBeUndefined();
  });

  it("matches any of a sandbox's several workspaces", () => {
    expect(findSandboxForPath("/wt/b/src", [{ name: "s1", workspaces: ["/wt/a", "/wt/b"] }])).toBe(
      "s1",
    );
  });

  it("prefers the most specific (longest) matching workspace", () => {
    expect(
      findSandboxForPath("/wt/project/src", [
        { name: "outer", workspaces: ["/wt"] },
        { name: "inner", workspaces: ["/wt/project"] },
      ]),
    ).toBe("inner");
  });
});

describe("parseSandboxList", () => {
  it("reads a bare array of sandbox rows", () => {
    expect(parseSandboxList([{ name: "s1", workspaces: ["/wt/project"] }])).toEqual([
      { name: "s1", workspaces: ["/wt/project"] },
    ]);
  });

  it("reads a {sandboxes: [...]} wrapper", () => {
    expect(parseSandboxList({ sandboxes: [{ name: "s1", workspaces: ["/wt/project"] }] })).toEqual([
      { name: "s1", workspaces: ["/wt/project"] },
    ]);
  });

  it("accepts a `sandbox` field as the name when `name` is absent", () => {
    expect(parseSandboxList([{ sandbox: "s1", workspaces: ["/wt/project"] }])).toEqual([
      { name: "s1", workspaces: ["/wt/project"] },
    ]);
  });

  it("drops a row with no usable name rather than throwing", () => {
    expect(parseSandboxList([{ workspaces: ["/wt/project"] }])).toEqual([]);
  });

  it("keeps a row whose workspaces are missing, as an empty list", () => {
    expect(parseSandboxList([{ name: "s1" }])).toEqual([{ name: "s1", workspaces: [] }]);
  });

  it("reads the real `sbx ls --json` shape, including status", () => {
    expect(
      parseSandboxList({
        sandboxes: [
          {
            name: "teste-infra",
            id: "8d6ac255",
            agent: "claude",
            status: "running",
            workspaces: ["/Users/me/Documents/84codes/infrastructure"],
          },
        ],
      }),
    ).toEqual([
      {
        name: "teste-infra",
        status: "running",
        workspaces: ["/Users/me/Documents/84codes/infrastructure"],
      },
    ]);
  });

  it("tolerates a singular `workspace` string", () => {
    expect(parseSandboxList([{ name: "s1", workspace: "/wt/project" }])).toEqual([
      { name: "s1", workspaces: ["/wt/project"] },
    ]);
  });

  it("degrades to no sandboxes for shapes it does not recognize", () => {
    expect(parseSandboxList(null)).toEqual([]);
    expect(parseSandboxList("not json")).toEqual([]);
    expect(parseSandboxList({})).toEqual([]);
    expect(parseSandboxList([null, 42, "x"])).toEqual([]);
  });
});
