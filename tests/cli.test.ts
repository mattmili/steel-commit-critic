import { describe, expect, it } from "vitest";
import {
  parseFailUnder,
  parseLimit,
  readVersion,
  resolveMode,
} from "../src/cli.js";

describe("parseLimit", () => {
  it("accepts a positive integer", () => {
    expect(parseLimit("25")).toBe(25);
  });

  it.each(["0", "-3", "1.5", "abc", ""])("rejects %j", (raw) => {
    expect(() => parseLimit(raw)).toThrow("--limit must be a positive integer");
  });
});

describe("parseFailUnder", () => {
  it.each([
    ["0", 0],
    ["6", 6],
    ["7.5", 7.5],
    ["10", 10],
  ])("accepts %j", (raw, expected) => {
    expect(parseFailUnder(raw)).toBe(expected);
  });

  it.each(["-1", "10.1", "abc", ""])("rejects %j", (raw) => {
    expect(() => parseFailUnder(raw)).toThrow("--fail-under must be a number");
  });
});

describe("readVersion", () => {
  it("reads a semver string from package.json", () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("resolveMode", () => {
  it("resolves analyze with url, json, limit and failUnder", () => {
    expect(
      resolveMode({
        analyze: true,
        url: "u",
        json: true,
        limit: 10,
        failUnder: 6,
      }),
    ).toEqual({
      kind: "analyze",
      url: "u",
      json: true,
      limit: 10,
      failUnder: 6,
    });
  });

  it("defaults json to false", () => {
    expect(resolveMode({ analyze: true })).toEqual({
      kind: "analyze",
      url: undefined,
      json: false,
      limit: undefined,
      failUnder: undefined,
    });
  });

  it("resolves write", () => {
    expect(resolveMode({ write: true })).toEqual({ kind: "write" });
  });

  it("throws when both modes are given", () => {
    expect(() => resolveMode({ analyze: true, write: true })).toThrow(
      "not both",
    );
  });

  it("throws when no mode is given", () => {
    expect(() => resolveMode({})).toThrow("Nothing to do");
  });
});
