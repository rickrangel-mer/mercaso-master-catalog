import { describe, expect, it } from "vitest";
import { matchByName, matchScore, matchStores, meters, nameSimilarity, nameWords, streetNumber, type Place, type Store } from "./lib.ts";

describe("names", () => {
  it("drops punctuation, filler and store numbers", () => {
    expect(nameWords("Stanton Liquor & Mart #1, Inc.")).toEqual(["stanton", "liquor", "mart"]);
  });
  it("scores similar names high and different ones low", () => {
    expect(nameSimilarity("Para Liquor", "PARA LIQUOR INC")).toBe(1);
    expect(nameSimilarity("Tic Tac Market & Liquor", "Tic-Tac Market and Liquor")).toBeGreaterThan(0.9);
    expect(nameSimilarity("Chevron", "Joe's Laundromat")).toBeLessThan(0.2);
  });
});

describe("geometry and addresses", () => {
  it("measures meters and reads street numbers", () => {
    expect(meters(34, -118, 34.001, -118)).toBeCloseTo(111, 0);
    expect(streetNumber("3003 W Olympic Blvd #105")).toBe("3003");
    expect(streetNumber("W Olympic Blvd")).toBe("");
  });
});

const place = (extra: Partial<Place>): Place => ({ id: "p1", name: "Para Liquor", address: "100 Main St", zip: "90001", lat: 34, lng: -118, ...extra });
const store = (extra: Partial<Store>): Store => ({ id: "s1", name: "Para Liquor Inc", address: "100 Main St", zip: "90001", lat: 34.0002, lng: -118, placeId: "", ...extra });

describe("matchScore", () => {
  it("matches on place id first, then nearby with a similar name, then street number and ZIP", () => {
    expect(matchScore(store({ placeId: "p1", name: "Other" }), place({}))?.method).toBe("place id");
    expect(matchScore(store({}), place({}))?.method).toBe("nearby + name");
    expect(matchScore(store({ lat: 0, lng: 0 }), place({}))?.method).toBe("address + name");
    expect(matchScore(store({ name: "Speedy Wash" }), place({}))).toBeNull();
    // A short form of the name at the same spot.
    expect(matchScore(store({ name: "T&D Liquor Jr. Market", lat: 34 }), place({ name: "T & D's" }))?.method).toBe("nearby + name");
    expect(matchScore(store({ lat: 34.01 }), place({ address: "9 Elm St" }))).toBeNull(); // 1.1 km away, other address
  });
});

describe("matchStores", () => {
  it("pairs stores and places one to one, best first", () => {
    const places = [place({}), place({ id: "p2", name: "Para Liquor 2", lat: 34.0004 })];
    const m = matchStores([store({}), store({ id: "s2", name: "Para Liquor 2", lat: 34.0004 })], places);
    expect(m.get("s1")?.place).toBe("p1");
    expect(m.get("s2")?.place).toBe("p2");
  });
});

describe("matchByName", () => {
  it("takes the most similar name in the ZIP above the bar", () => {
    const list = [place({}), place({ id: "p2", name: "Main Street Market" })];
    expect(matchByName("PARA LIQUOR", "90001", list)?.id).toBe("p1");
    expect(matchByName("Sunset Wash", "90001", list)).toBeNull();
  });
});
