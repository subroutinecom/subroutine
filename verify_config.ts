import { createModel } from "./api/agent/utils/providers.ts";
import { Capability } from "./api/agent/utils/types.ts";
import { getConfig } from "./api/config/loader.ts";
import { printConfigReport, validateConfig } from "./api/config/validator.ts";

async function verify() {
  console.log("🔍 Verifying configuration refactor...\n");

  // 1. Test Config Loading & Validation
  console.log("1️⃣  Testing Config Loading & Validation");
  try {
    const config = await getConfig();

    // Print detailed report
    printConfigReport(config);

    // Additional validation
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.error("❌ Config validation failed:");
      for (const error of validation.errors) {
        console.error(`  • ${error}`);
      }
      Deno.exit(1);
    }
  } catch (e) {
    console.error("❌ Config loading failed:", e);
    Deno.exit(1);
  }

  // 2. Test createModel with Capabilities
  console.log("\n2️⃣  Testing createModel with Capabilities");

  const testCases: Array<{ capability: Capability; description: string }> = [
    { capability: Capability.GENERAL, description: "GENERAL" },
    { capability: Capability.CODING, description: "CODING" },
    { capability: Capability.CODING_FIRSTPASS, description: "CODING_FIRSTPASS (with fallback)" },
    { capability: Capability.WEB_SEARCH, description: "WEB_SEARCH" },
    { capability: Capability.PLANNING, description: "PLANNING" },
  ];

  for (const { capability, description } of testCases) {
    try {
      const model = await createModel(capability);
      if (model) {
        console.log(`  ✅ ${description}: Model created successfully`);
      } else {
        console.error(`  ❌ ${description}: createModel returned null`);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${description}: ${error}`);
    }
  }

  console.log("\n✨ Verification complete!\n");
}

verify();
