import { z } from "zod";
import { formatInput } from "./agent-input-formatter.ts";

const main = async () => {
  console.log("Running manual verification for agent-input-formatter...");

  const schema = z.object({
    x: z.coerce.string(),
    y: z.coerce.string(),
    operation: z.string(),
  });

  const input = "can you please add 10 and 5 together?";

  console.log("Input:", input);
  console.log("Schema: { x: string, y: string, operation: string }");

  const result = await formatInput({
    input,
    schema,
  });

  if (result.success) {
    console.log("Success!");
    console.log("Value:", JSON.stringify(result.value, null, 2));

    // Simple assertion
    const val = result.value as any;
    if (val.x === "10" && val.y === "5" && (val.operation === "add" || val.operation === "sum")) {
      console.log("VERIFICATION PASSED");
    } else {
      console.log("VERIFICATION FAILED: Unexpected values");
    }
  } else {
    console.error("Failed:", result.error);
  }
};

if (import.meta.main) {
  main();
}
