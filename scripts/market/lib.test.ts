import { describe, expect, it } from "vitest";
import { areaOfZip, indexer, repsByZip } from "./lib.ts";

describe("areaOfZip", () => {
  const regions = new Map([
    ["90001", "South LA"],
    ["90010", "Central LA"],
    ["92801", "Orange County"],
  ]);
  const zip3 = { "921": "San Diego County" };
  it("takes the ZIP's own region, then a named ZIP3 area, then the nearest mapped ZIP in its ZIP3", () => {
    expect(areaOfZip("90001", regions, zip3)).toBe("South LA");
    expect(areaOfZip("92101", regions, zip3)).toBe("San Diego County");
    expect(areaOfZip("90008", regions, zip3)).toBe("Central LA");
    expect(areaOfZip("90003", regions, zip3)).toBe("South LA");
    expect(areaOfZip("92805-1234", regions, zip3)).toBe("Orange County");
  });
  it("leaves an unknown or missing ZIP unplaced", () => {
    expect(areaOfZip("", regions, zip3)).toBe("");
    expect(areaOfZip("95814", regions, zip3)).toBe("");
  });
});

describe("repsByZip", () => {
  it("gives each ZIP the rep most of its prospects carry", () => {
    const m = repsByZip([
      { zip: "90001", rep: "A" },
      { zip: "90001", rep: "B" },
      { zip: "90001", rep: "B" },
      { zip: "90002", rep: "" },
    ]);
    expect(m.get("90001")).toBe("B");
    expect(m.has("90002")).toBe(false);
  });
});

describe("indexer", () => {
  it("returns stable indexes and appends new names", () => {
    const list = ["a"];
    const at = indexer(list);
    expect(at("a")).toBe(0);
    expect(at("b")).toBe(1);
    expect(at("b")).toBe(1);
    expect(list).toEqual(["a", "b"]);
  });
});
