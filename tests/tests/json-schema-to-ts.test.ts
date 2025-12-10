import { expect } from "@std/expect/expect";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import { enableAiTests } from "../fixtures/aitests.ts";

const IntegrationShape = {
  MCP: {
    "mock-weather-server": {
      getForecast: {
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name or coordinates",
            },
            days: {
              type: "number",
              minimum: 1,
              maximum: 7,
              description: "Number of days",
            },
          },
          required: ["location"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
      },
    },

    "mock-mail-server": {
      listMessages: {
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of messages to list",
            },
          },
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
      },
      sendMessage: {
        inputSchema: {
          type: "object",
          properties: {
            to: {
              type: "string",
              format: "email",
              description: "Recipient email address",
            },
            subject: {
              type: "string",
              description: "Email subject",
            },
            body: {
              type: "string",
              description: "Email body",
            },
          },
          required: ["to", "subject", "body"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
      },
    },
  },
} as const;

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent input formatter API`,
  ignore: !enableAiTests,
  fn: async () => {
    const validate = <S extends JSONSchema>(_data: FromSchema<S>) => "hello";

    validate<{
      type: "object";
      properties: {
        foo: { type: "string" };
      };
      required: ["foo"];
    }>({
      foo: "123",
    });

    const dogSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        hobbies: { type: "array", items: { type: "string" } },
        favoriteFood: { type: "string" },
      },
      required: ["name", "age"],
    } as const;

    type Dog = FromSchema<typeof dogSchema>;
    const echo: Dog = {
      name: "Echo",
      age: 6,
      hobbies: ["fetch", "sleeping"],
      favoriteFood: "cheese",
    };
    expect(echo).toBeTruthy();
  },
});
