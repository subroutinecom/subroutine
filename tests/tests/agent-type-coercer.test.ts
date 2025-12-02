import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: "agent type coercer API (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const personSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { name: "Alice", age: "32" },
        instructions: "Coerce the input to match the schema exactly.",
        schema: JSON.stringify(zodToJsonSchema(personSchema)),
        mode: "json",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    assertExists(data.value);

    const parsed = personSchema.parse(data.value);
    assertEquals(typeof parsed.name, "string");
    assertEquals(typeof parsed.age, "number");
  },
});

Deno.test({
  name: "agent type coercer API rejects incompatible input (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { nickname: "Bob" },
        instructions: "Return only valid JSON.",
        schema: JSON.stringify(zodToJsonSchema(schema)),
        mode: "json",
      }),
    });

    const data = await response.json();

    if (response.status === 400) {
      assertEquals(data.success, false);
      assertExists(data.error);
      return;
    }

    // If the API returned success, ensure the result does NOT satisfy the schema.
    assertEquals(data.success, true);
    const parsed = schema.safeParse(data.value);
    assertEquals(parsed.success, false);
  },
});

Deno.test({
  name: "agent type coercer flattens GitHub-like repo/pr response (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const simplifiedPrSchema = z.object({
      pullRequests: z.array(
        z.object({
          repository: z.string(),
          id: z.string(),
          title: z.string(),
          url: z.string().url().optional(),
          author: z.string().optional(),
          state: z.string(),
        })
      ),
    });

    const input = {
      data: {
        __typename: "Query",
        viewer: {
          __typename: "User",
          repositories: {
            __typename: "RepositoryConnection",
            pageInfo: {
              __typename: "PageInfo",
              hasNextPage: false,
              endCursor: "cursor-repos",
            },
            nodes: [
              {
                __typename: "Repository",
                name: "subroutine",
                pullRequests: {
                  __typename: "PullRequestConnection",
                  pageInfo: {
                    __typename: "PageInfo",
                    hasNextPage: false,
                    endCursor: "cursor-subroutine-prs",
                  },
                  nodes: [
                    {
                      __typename: "PullRequest",
                      id: "pr1",
                      title: "Fix bug",
                      url: "https://github.com/org/subroutine/pull/1",
                      author: { login: "dev1" },
                      state: "OPEN",
                    },
                  ],
                },
              },
              {
                __typename: "Repository",
                name: "toolkit",
                pullRequests: {
                  __typename: "PullRequestConnection",
                  pageInfo: {
                    __typename: "PageInfo",
                    hasNextPage: true,
                    endCursor: "cursor-toolkit-prs",
                  },
                  nodes: [
                    {
                      __typename: "PullRequest",
                      id: "pr2",
                      title: "Add feature",
                      url: "https://github.com/org/toolkit/pull/2",
                      author: { login: "dev2" },
                      state: "OPEN",
                    },
                    {
                      __typename: "PullRequest",
                      id: "pr3",
                      title: "Docs update",
                      url: "https://github.com/org/toolkit/pull/3",
                      author: { login: "dev3" },
                      state: "MERGED",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        instructions:
          "Given the GraphQL response, produce a flat list of pull requests with repository name, id, title, url, author login, and state in pullRequests[].",
        schema: JSON.stringify(zodToJsonSchema(simplifiedPrSchema)),
        mode: "json",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    const parsed = simplifiedPrSchema.parse(data.value);

    assertEquals(parsed.pullRequests.length, 3);
    const first = parsed.pullRequests[0];
    assertEquals(typeof first.repository, "string");
    assertEquals(typeof first.id, "string");
    assertEquals(typeof first.title, "string");
  },
});

Deno.test("zod schema parsing distinguishes object types", () => {
  const schemaA = z.object({
    name: z.string(),
    age: z.number(),
  });

  const schemaB = z.object({
    name: z.string(),
    active: z.boolean(),
  });

  const objA = { name: "Carol", age: 29 };
  const parsedA = schemaA.parse(objA);
  assertEquals(parsedA, objA);

  assertThrows(() => {
    schemaB.parse(objA);
  });
});
