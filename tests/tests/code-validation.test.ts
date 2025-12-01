import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const API_BASE = "http://api.subroutine.internal";

type ValidationError = {
  rule: string;
  message: string;
  line?: number;
  column?: number;
};

type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

const validateCode = async (code: string): Promise<ValidationResult> => {
  const response = await fetch(`${API_BASE}/tests/validate-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`Validation request failed: ${response.status}`);
  }

  return response.json();
};

describe("AST-based Code Validation", () => {
  const validCode = `
    import type { Integrations } from "@subroutine/integration-types";

    type Inputs = { value: number };
    type Outputs = { result: number };

    export async function main(inputs: Inputs, integrations: Integrations): Promise<Outputs> {
      return { result: inputs.value * 2 };
    }
  `;

  describe("validateCode", () => {
    it("accepts valid code", async () => {
      const result = await validateCode(validCode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("require-export-main", () => {
    it("accepts exported async function main", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-export-main")
      ).toHaveLength(0);
    });

    it("accepts separate export statement", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
        export { main };
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-export-main")
      ).toHaveLength(0);
    });

    it("accepts exported arrow function", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export const main = async (integrations: unknown, inputs: Inputs): Promise<Outputs> => {
          return {};
        };
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-export-main")
      ).toHaveLength(0);
    });

    it("rejects non-exported main", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-export-main")).toBe(
        true
      );
    });

    it("does not match export in comments (false positive prevention)", async () => {
      const code = `
        // export is mentioned here but shouldn't count
        type Inputs = {};
        type Outputs = {};
        async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-export-main")).toBe(
        true
      );
    });
  });

  describe("require-async-main", () => {
    it("accepts async function main", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-async-main")
      ).toHaveLength(0);
    });

    it("accepts async arrow function", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export const main = async (integrations: unknown, inputs: Inputs): Promise<Outputs> => {
          return {};
        };
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-async-main")
      ).toHaveLength(0);
    });

    it("rejects non-async main function", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export function main(inputs: Inputs, integrations: unknown): Outputs {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-async-main")).toBe(
        true
      );
    });

    it("rejects non-async arrow function", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export const main = (integrations: unknown, inputs: Inputs): Outputs => {
          return {};
        };
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-async-main")).toBe(
        true
      );
    });
  });

  describe("require-inputs-type", () => {
    it("accepts type Inputs", async () => {
      const code = `
        type Inputs = { value: string };
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-inputs-type")
      ).toHaveLength(0);
    });

    it("accepts interface Inputs", async () => {
      const code = `
        interface Inputs { value: string }
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-inputs-type")
      ).toHaveLength(0);
    });

    it("rejects missing Inputs type", async () => {
      const code = `
        type Outputs = {};
        export async function main(inputs: unknown, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-inputs-type")).toBe(
        true
      );
    });
  });

  describe("require-outputs-type", () => {
    it("accepts type Outputs", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: string };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return { result: "ok" };
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-outputs-type")
      ).toHaveLength(0);
    });

    it("accepts interface Outputs", async () => {
      const code = `
        type Inputs = {};
        interface Outputs { result: string }
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return { result: "ok" };
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-outputs-type")
      ).toHaveLength(0);
    });

    it("rejects missing Outputs type", async () => {
      const code = `
        type Inputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<unknown> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-outputs-type")).toBe(
        true
      );
    });
  });

  describe("require-return-in-main", () => {
    it("accepts main with return statement", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-return-in-main")
      ).toHaveLength(0);
    });

    it("accepts arrow function with expression body (implicit return)", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export const main = async (integrations: unknown, inputs: Inputs): Promise<Outputs> => ({});
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-return-in-main")
      ).toHaveLength(0);
    });

    it("rejects main without return", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          console.log("no return");
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-return-in-main")).toBe(
        true
      );
    });

    it("does not count return in nested functions", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const helper = () => { return 42; };
          helper();
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "require-return-in-main")).toBe(
        true
      );
    });

    it("accepts return inside conditional", async () => {
      const code = `
        type Inputs = { flag: boolean };
        type Outputs = { result: string };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          if (inputs.flag) {
            return { result: "yes" };
          }
          return { result: "no" };
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-return-in-main")
      ).toHaveLength(0);
    });
  });

  describe("no-ctx-usage", () => {
    it("accepts code without ctx", async () => {
      const result = await validateCode(validCode);
      expect(result.errors.filter((e: ValidationError) => e.rule === "no-ctx-usage")).toHaveLength(
        0
      );
    });

    it("rejects ctx.property access", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, ctx: unknown): Promise<Outputs> {
          const x = ctx.value;
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "no-ctx-usage")).toBe(true);
    });

    it("rejects ctx as parameter name", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, ctx: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "no-ctx-usage")).toBe(true);
    });
  });

  describe("no-fetch-calls", () => {
    it("accepts code without fetch", async () => {
      const result = await validateCode(validCode);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "no-fetch-calls")
      ).toHaveLength(0);
    });

    it("rejects direct fetch() call", async () => {
      const code = `
        type Inputs = { url: string };
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const response = await fetch(inputs.url);
          const data = await response.json();
          return { data };
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "no-fetch-calls")).toBe(true);
    });

    it("rejects globalThis.fetch() call", async () => {
      const code = `
        type Inputs = { url: string };
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const response = await globalThis.fetch(inputs.url);
          const data = await response.json();
          return { data };
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "no-fetch-calls")).toBe(true);
    });

    it("error message explains sandbox restrictions", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          await fetch("http://example.com");
          return {};
        }
      `;
      const result = await validateCode(code);
      const fetchError = result.errors.find((e: ValidationError) => e.rule === "no-fetch-calls");
      expect(fetchError?.message).toContain("sandboxed environment");
      expect(fetchError?.message).toContain("integrations");
    });
  });

  describe("require-await-mcp-client", () => {
    it("accepts awaited getMcpClient call", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("test");
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-await-mcp-client")
      ).toHaveLength(0);
    });

    it("rejects non-awaited getMcpClient call", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = integrations.getMcpClient("test");
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "require-await-mcp-client")
      ).toBe(true);
    });

    it("error message explains the fix", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = integrations.getMcpClient("linear");
          return {};
        }
      `;
      const result = await validateCode(code);
      const error = result.errors.find(
        (e: ValidationError) => e.rule === "require-await-mcp-client"
      );
      expect(error?.message).toContain("await");
      expect(error?.message).toContain("Promise");
    });
  });

  describe("require-mcp-client-access", () => {
    it("accepts integrations.getMcpClient usage", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("linear");
          return { result: client };
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-mcp-client-access")
      ).toHaveLength(0);
    });

    it("rejects direct integration property access", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const result = await integrations.linear.call({ tool: "test", arguments: {} });
          return { result };
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "require-mcp-client-access")
      ).toBe(true);
    });

    it("error message suggests getMcpClient", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const x = integrations.someService;
          return {};
        }
      `;
      const result = await validateCode(code);
      const error = result.errors.find(
        (e: ValidationError) => e.rule === "require-mcp-client-access"
      );
      expect(error?.message).toContain("getMcpClient");
      expect(error?.message).toContain("someService");
    });

    it("catches nested property access on integrations", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = integrations.github;
          const result = await client.call({ tool: "test" });
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "require-mcp-client-access")
      ).toBe(true);
    });
  });

  describe("line numbers in errors", () => {
    it("includes line numbers when possible", async () => {
      // Use code that produces errors with line numbers (non-async main, missing return)
      const code = `
        type Inputs = {};
        type Outputs = {};
        export function main(inputs: Inputs, integrations: unknown): Outputs {
          console.log("no return, not async");
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // At least one error should have a line number
      expect(result.errors.some((e: ValidationError) => e.line !== undefined)).toBe(true);
    });
  });

  describe("multiple errors", () => {
    it("reports all validation errors", async () => {
      const code = `
        // No Inputs, no Outputs, not exported, not async, no return
        function main(): void {
          console.log("broken");
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
