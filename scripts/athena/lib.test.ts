import { describe, expect, it } from "vitest";
import { configFromEnv, credentialsFromEnv, explainAwsError, fillCatalogSkus, fillSkuItems, fillStoreType, pageToRows, prepareSql, toCsv } from "./lib.ts";

describe("configFromEnv", () => {
  const keys = { AWS_ACCESS_KEY_ID: "k", AWS_SECRET_ACCESS_KEY: "s" };

  it("reads region, workgroup and the staging dir", () => {
    const { config, missing } = configFromEnv({ ...keys, AWS_REGION: "us-west-2", ATHENA_WORKGROUP: "wg", ATHENA_S3_STAGING_DIR: "s3://b/p/" });
    expect(missing).toEqual([]);
    expect(config).toEqual({ region: "us-west-2", workgroup: "wg", outputLocation: "s3://b/p/" });
  });

  it("defaults the workgroup and allows no results path", () => {
    expect(configFromEnv({ ...keys, AWS_REGION: "us-east-1" }).config).toEqual({ region: "us-east-1", workgroup: "primary" });
  });

  it("lists what is missing, treating blank values as missing", () => {
    expect(configFromEnv({ AWS_REGION: " ", AWS_ACCESS_KEY_ID: "k" }).missing).toEqual(["AWS_REGION", "AWS_SECRET_ACCESS_KEY"]);
  });
});

describe("credentialsFromEnv", () => {
  it("passes a session token through with temporary keys", () => {
    expect(credentialsFromEnv({ AWS_ACCESS_KEY_ID: "ASIAX", AWS_SECRET_ACCESS_KEY: "s", AWS_SESSION_TOKEN: "t" })).toEqual({
      credentials: { accessKeyId: "ASIAX", secretAccessKey: "s", sessionToken: "t" },
    });
  });

  it("ignores a session token next to a long-term key, with a warning", () => {
    const { credentials, warning } = credentialsFromEnv({ AWS_ACCESS_KEY_ID: "AKIAX", AWS_SECRET_ACCESS_KEY: "s", AWS_SESSION_TOKEN: "t" });
    expect(credentials).toEqual({ accessKeyId: "AKIAX", secretAccessKey: "s" });
    expect(warning).toMatch(/AWS_SESSION_TOKEN/);
  });
});

describe("helpers", () => {
  it("drops a trailing semicolon but keeps comments", () => {
    expect(prepareSql("-- note\nSELECT 1;\n")).toBe("-- note\nSELECT 1");
  });

  it("turns a result page into rows, with nulls as empty strings", () => {
    expect(pageToRows({ Rows: [{ Data: [{ VarCharValue: "sku" }, { VarCharValue: "name" }] }, { Data: [{ VarCharValue: "A1" }, {}] }] })).toEqual([
      ["sku", "name"],
      ["A1", ""],
    ]);
  });

  it("quotes CSV cells that need it", () => {
    expect(toCsv([["a", "b,c"], ['say "hi"', "line\nbreak"]])).toBe('a,"b,c"\n"say ""hi""","line\nbreak"\n');
  });

  it("explains the common credential errors", () => {
    expect(explainAwsError({ name: "ExpiredToken", message: "x" })).toContain("Refresh AWS_ACCESS_KEY_ID");
    expect(explainAwsError({ name: "Weird", message: "boom" })).toBe("Weird: boom");
  });
});

describe("fillCatalogSkus", () => {
  it("fills the placeholder with a sorted, de-duplicated, quoted list", () => {
    expect(fillCatalogSkus("WHERE sku IN ({{CATALOG_SKUS}})", ["B-2", "A1", "B-2", "C_1P"])).toBe("WHERE sku IN ('A1', 'B-2', 'C_1P')");
    expect(fillCatalogSkus("SELECT 1", [])).toBe("SELECT 1");
  });

  it("refuses SKUs that could change the query", () => {
    expect(() => fillCatalogSkus("IN ({{CATALOG_SKUS}})", ["A1", "x') OR ('1'='1"])).toThrow(/unexpected characters/);
    expect(() => fillCatalogSkus("IN ({{CATALOG_SKUS}})", [])).toThrow(/no SKUs/);
  });
});

describe("fillStoreType", () => {
  it("fills the store type, and leaves SQL without the placeholder alone", () => {
    expect(fillStoreType("WHERE store_type = '{{STORE_TYPE}}'", "Laundromat")).toBe("WHERE store_type = 'Laundromat'");
    expect(fillStoreType("SELECT 1", undefined)).toBe("SELECT 1");
  });

  it("refuses a missing or unsafe store type", () => {
    expect(() => fillStoreType("'{{STORE_TYPE}}'", undefined)).toThrow(/names no store type/);
    expect(() => fillStoreType("'{{STORE_TYPE}}'", "x' OR '1'='1")).toThrow(/unexpected characters/);
  });
});

describe("fillSkuItems", () => {
  it("writes one VALUES tuple per SKU and item, once each", () => {
    const rows = [
      { sku: "A1", item: "scd.cola.x", category: "scd.cola", casePack: 24 },
      { sku: "A1", item: "scd.cola.x", category: "scd.cola", casePack: 24 },
      { sku: "B-2", item: "drinks.water.y", category: "drinks.water", casePack: 12 },
    ];
    expect(fillSkuItems("VALUES {{SKU_ITEMS}}", rows)).toBe("VALUES ('A1', 'scd.cola.x', 'scd.cola', 24),\n  ('B-2', 'drinks.water.y', 'drinks.water', 12)");
    expect(fillSkuItems("SELECT 1", [])).toBe("SELECT 1");
  });

  it("refuses unsafe values and an empty list", () => {
    expect(() => fillSkuItems("{{SKU_ITEMS}}", [])).toThrow(/no approved matches/);
    expect(() => fillSkuItems("{{SKU_ITEMS}}", [{ sku: "A'1", item: "a.b", category: "a.b", casePack: 1 }])).toThrow(/unexpected values/);
    expect(() => fillSkuItems("{{SKU_ITEMS}}", [{ sku: "A1", item: "a.b", category: "a.b", casePack: 0 }])).toThrow(/unexpected values/);
  });
});
