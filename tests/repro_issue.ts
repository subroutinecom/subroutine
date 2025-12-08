
// 1. INVALID: Nested import in data URI
const invalidCode = `
export default async function(inputs) {
  import { z } from "zod";
  return { success: true };
}
`;
const invalidUrl = `data:application/typescript;base64,${btoa(invalidCode)}`;

console.log("--- Attempting INVALID code (nested import) ---");
try {
  await import(invalidUrl);
  console.log("SUCCESS (Unexpected)");
} catch (e) {
  console.log("FAILED (Expected):");
  console.log((e as Error).message);
}

// 2. VALID: Top-level import in data URI
const validCode = `
import { z } from "zod";
export default async function(inputs) {
  return { success: true };
}
`;
const validUrl = `data:application/typescript;base64,${btoa(validCode)}`;

console.log("\n--- Attempting VALID code (top-level import) ---");
try {
  await import(validUrl);
  console.log("SUCCESS");
} catch (e) {
  console.log("FAILED (Unexpected):");
  console.log(e);
}
