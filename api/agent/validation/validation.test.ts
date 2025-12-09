import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { validateCode } from "./validator";

type ValidationError = {
  rule: string;
  message: string;
  line?: number;
  column?: number;
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

    it("accepts GraphQL and OpenAPI integrations when declared", async () => {
      const code = `
        import type { Integrations } from "@subroutine/integration-types";

        type Inputs = {};
        type Outputs = { ok: boolean };

        export async function main(_inputs: Inputs, integrations: Integrations): Promise<Outputs> {
          const gql = await integrations.getGraphQLClient("gql");
          const data = await gql.request<{ hello: string }>("query { hello }");

          const rest = await integrations.getOpenAPIClient("rest");
          const users = await rest.request("GET", "/users");

          return { ok: Boolean(data) && Boolean(users) };
        }
      `;

      const result = await validateCode(code, {
        graphqlIntegrations: [
          { name: "gql", schema: "type Query { hello: String }" },
        ],
        openapiIntegrations: [
          { name: "rest", spec: "{}", operations: [{ method: "GET", path: "/users" }] },
        ],
      });

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

    it("accepts class Inputs", async () => {
      const code = `
        class Inputs { value: string }
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

    it("accepts z.infer Inputs", async () => {
      const code = `
        import { z } from "zod";
        const InputsSchema = z.object({ value: z.string() });
        type Inputs = z.infer<typeof InputsSchema>;
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

    it("accepts class Outputs", async () => {
      const code = `
        type Inputs = {};
        class Outputs { result: string }
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return { result: "ok" };
        }
      `;
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "require-outputs-type")
      ).toHaveLength(0);
    });

    it("accepts z.infer Outputs", async () => {
      const code = `
        import { z } from "zod";
        type Inputs = {};
        const OutputsSchema = z.object({ result: z.string() });
        type Outputs = z.infer<typeof OutputsSchema>;
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

  describe("validate-mcp-integration-name", () => {
    it("accepts valid integration name when context provided", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("github");
          return { result: client };
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github", "slack"] });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toHaveLength(0);
    });

    it("rejects invalid integration name when context provided", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("made-up-integration");
          return { result: client };
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github", "slack"] });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toBe(true);
    });

    it("error message lists available integrations", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("unknown");
          return {};
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github", "linear"] });
      const error = result.errors.find(
        (e: ValidationError) => e.rule === "validate-mcp-integration-name"
      );
      expect(error?.message).toContain("unknown");
      expect(error?.message).toContain("github");
      expect(error?.message).toContain("linear");
    });

    it("skips validation when no context provided (discovery mode)", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("any-name-is-fine");
          return { result: client };
        }
      `;
      // No context provided - discovery mode, should not validate names
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toHaveLength(0);
    });

    it("skips validation when mcpIntegrationNames is empty", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { result: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient("any-name");
          return { result: client };
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: [] });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toHaveLength(0);
    });

    it("catches multiple invalid integration names", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client1 = await integrations.getMcpClient("invalid1");
          const client2 = await integrations.getMcpClient("invalid2");
          return {};
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github"] });
      const errors = result.errors.filter(
        (e: ValidationError) => e.rule === "validate-mcp-integration-name"
      );
      expect(errors).toHaveLength(2);
    });

    it("allows mix of valid and invalid names, catches only invalid", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client1 = await integrations.getMcpClient("github");
          const client2 = await integrations.getMcpClient("invalid");
          return {};
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github", "slack"] });
      const errors = result.errors.filter(
        (e: ValidationError) => e.rule === "validate-mcp-integration-name"
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("invalid");
    });

    it("handles template literals without substitutions", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient(\`invalid-name\`);
          return {};
        }
      `;
      const result = await validateCode(code, { mcpIntegrationNames: ["github"] });
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toBe(true);
    });

    it("skips dynamic expressions (variables)", async () => {
      const code = `
        type Inputs = { integrationName: string };
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getMcpClient(inputs.integrationName);
          return {};
        }
      `;
      // Dynamic expressions can't be validated at compile time
      const result = await validateCode(code, { mcpIntegrationNames: ["github"] });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-mcp-integration-name")
      ).toHaveLength(0);
    });
  });

  describe("no-nested-imports", () => {
    it("accepts top-level imports", async () => {
      const code = `
        import { z } from "zod";
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(true);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "no-nested-imports")
      ).toHaveLength(0);
    });

    it("rejects import inside function", async () => {
      const code = `
        type Inputs = {};
        type Outputs = {};
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          import { z } from "zod";
          return {};
        }
      `;
      const result = await validateCode(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.rule === "no-nested-imports")).toBe(
        true
      );
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

  describe("validate-graphql-queries", () => {
    const testSchema = `
      type Query {
        user(id: ID!): User
        users(limit: Int): [User!]!
      }

      type User {
        id: ID!
        name: String!
        email: String!
      }
    `;

    it("accepts valid GraphQL query", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request(\`query { users { id name } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toHaveLength(0);
    });

    it("rejects invalid field in GraphQL query", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request(\`query { users { id nonExistentField } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toBe(true);
      expect(
        result.errors.some((e: ValidationError) => e.message.includes("nonExistentField"))
      ).toBe(true);
    });

    it("rejects invalid query type in GraphQL query", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request(\`query { nonExistentQuery { id } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toBe(true);
    });

    it("validates against correct schema when multiple integrations", async () => {
      const otherSchema = `
        type Query {
          products: [Product!]!
        }
        type Product {
          id: ID!
          title: String!
        }
      `;
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const userClient = await integrations.getGraphQLClient("users-api");
          const productClient = await integrations.getGraphQLClient("products-api");
          const users = await userClient.request(\`query { users { id name } }\`);
          const products = await productClient.request(\`query { products { id title } }\`);
          return { data: { users, products } };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [
          { name: "users-api", schema: testSchema },
          { name: "products-api", schema: otherSchema },
        ],
      });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toHaveLength(0);
    });

    it("catches query using wrong schema fields", async () => {
      const otherSchema = `
        type Query {
          products: [Product!]!
        }
        type Product {
          id: ID!
          title: String!
        }
      `;
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("products-api");
          // Using users field from wrong schema
          const result = await client.request(\`query { users { id } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "products-api", schema: otherSchema }],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toBe(true);
    });

    it("skips validation when no graphql context provided", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("any-api");
          const result = await client.request(\`query { anything { goes } }\`);
          return { data: result };
        }
      `;
      // No graphqlIntegrations in context
      const result = await validateCode(code);
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toHaveLength(0);
    });

    it("skips validation for dynamic queries (variables)", async () => {
      const code = `
        type Inputs = { query: string };
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request(inputs.query);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      // Dynamic queries can't be validated at compile time
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toHaveLength(0);
    });

    it("validates string literal queries", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request("query { users { id invalidField } }");
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toBe(true);
    });

    it("validates query with arguments", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          const result = await client.request(\`query { user(id: "123") { id name email } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(
        result.errors.filter((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toHaveLength(0);
    });

    it("catches missing required argument", async () => {
      const code = `
        type Inputs = {};
        type Outputs = { data: unknown };
        export async function main(inputs: Inputs, integrations: unknown): Promise<Outputs> {
          const client = await integrations.getGraphQLClient("my-api");
          // user requires id argument
          const result = await client.request(\`query { user { id name } }\`);
          return { data: result };
        }
      `;
      const result = await validateCode(code, {
        graphqlIntegrations: [{ name: "my-api", schema: testSchema }],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e: ValidationError) => e.rule === "validate-graphql-queries")
      ).toBe(true);
    });
  });
});
