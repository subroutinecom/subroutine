import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { validateIntegrationName, INTEGRATION_NAME_PATTERN } from "./integration-name";

describe("Integration Name Validation", () => {
  describe("INTEGRATION_NAME_PATTERN", () => {
    it("matches valid lowercase names", () => {
      expect(INTEGRATION_NAME_PATTERN.test("github")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("myapi")).toBe(true);
    });

    it("matches names with hyphens", () => {
      expect(INTEGRATION_NAME_PATTERN.test("my-api")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("my-github-api")).toBe(true);
    });

    it("matches names with underscores", () => {
      expect(INTEGRATION_NAME_PATTERN.test("my_api")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("my_github_api")).toBe(true);
    });

    it("matches names with numbers", () => {
      expect(INTEGRATION_NAME_PATTERN.test("api123")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("api-v2")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("test123api")).toBe(true);
    });

    it("matches combined valid characters", () => {
      expect(INTEGRATION_NAME_PATTERN.test("my_github-api_v2")).toBe(true);
      expect(INTEGRATION_NAME_PATTERN.test("test-api_123")).toBe(true);
    });

    it("rejects uppercase letters", () => {
      expect(INTEGRATION_NAME_PATTERN.test("GitHub")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("MyAPI")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("myAPI")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(INTEGRATION_NAME_PATTERN.test("my api")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("my github api")).toBe(false);
    });

    it("rejects special characters", () => {
      expect(INTEGRATION_NAME_PATTERN.test("my@api")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("my.api")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("my!api")).toBe(false);
      expect(INTEGRATION_NAME_PATTERN.test("my#api")).toBe(false);
    });
  });

  describe("validateIntegrationName", () => {
    it("accepts valid lowercase names", () => {
      expect(validateIntegrationName("github").valid).toBe(true);
      expect(validateIntegrationName("my-api").valid).toBe(true);
      expect(validateIntegrationName("api_v2").valid).toBe(true);
      expect(validateIntegrationName("test-api-123").valid).toBe(true);
    });

    it("rejects empty names", () => {
      const result = validateIntegrationName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects whitespace-only names", () => {
      const result = validateIntegrationName("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects names with uppercase letters", () => {
      const result = validateIntegrationName("GitHub");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("lowercase");
    });

    it("rejects names with spaces", () => {
      const result = validateIntegrationName("my api");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("lowercase");
    });

    it("rejects names with special characters", () => {
      const result = validateIntegrationName("my@api");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("lowercase");
    });

    it("returns undefined error when valid", () => {
      const result = validateIntegrationName("valid-name");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
