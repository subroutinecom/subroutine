import { expect } from "@std/expect/expect";
import { FromSchema, JSONSchema } from "json-schema-to-ts";
import { enableAiTests } from "../fixtures/aitests.ts";

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
