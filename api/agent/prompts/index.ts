import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type IntegrationDocs = {
  id: string;
  functionName: string;
  usageExample: string;
  docsUrl?: string;
};

export const IntegrationInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["mcp", "graphql", "openapi"]),
  connectionUrl: z.string().optional(),
  tools: z.array(z.record(z.unknown())).optional(),
  schema: z.string().optional(),
  operations: z.array(z.record(z.unknown())).optional(),
});

export type IntegrationInfo = z.infer<typeof IntegrationInfoSchema>;

let integrationTypesCache: string | null = null;

const getIntegrationTypesContent = (): string => {
  if (integrationTypesCache) return integrationTypesCache;

  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const dtsPath = resolve(currentDir, "../../packages/integration-types/integrations.d.ts");
    integrationTypesCache = Deno.readTextFileSync(dtsPath);
    return integrationTypesCache;
  } catch {
    return "// Integration types not available";
  }
};

const validationRules = (() => {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const rulesDir = resolve(currentDir, "../validation/rules");
    const rules: string[] = [];

    for (const entry of Deno.readDirSync(rulesDir)) {
      if (entry.isFile && entry.name.endsWith(".ts") && entry.name !== "index.ts") {
        rules.push(entry.name.replace(".ts", ""));
      }
    }
    return rules.sort();
  } catch {
    return [];
  }
})();

const getStandardIntegrationDocs = (integrationId: string): IntegrationDocs | null => {
  switch (integrationId) {
    case "gmail":
      return {
        id: "gmail",
        functionName: "getGmail",
        usageExample: `const gmail = await integrations.getGmail();
const labels = await gmail.users.labels.list({ userId: "me" });
const messages = await gmail.users.messages.list({ userId: "me", maxResults: 10 });
const msg = await gmail.users.messages.get({ userId: "me", id: messageId });`,
        docsUrl: "https://googleapis.dev/nodejs/googleapis/latest/gmail/index.html",
      };

    case "google_calendar":
      return {
        id: "google_calendar",
        functionName: "getCalendar",
        usageExample: `const calendar = await integrations.getCalendar();
const calendars = await calendar.calendarList.list();
const events = await calendar.events.list({ calendarId: "primary", maxResults: 10 });
const newEvent = await calendar.events.insert({
  calendarId: "primary",
  requestBody: { summary: "Meeting", start: { dateTime: "..." }, end: { dateTime: "..." } }
});`,
        docsUrl: "https://googleapis.dev/nodejs/googleapis/latest/calendar/index.html",
      };

    default:
      return null;
  }
};

/**
 * Generates documentation for when integrations ARE provided.
 * Agent must use the provided integrations.
 */
const getProvidedIntegrationsDocs = (integrations: IntegrationInfo[]): string => {
  const namesList = integrations.map((i) => `"${i.name}" (${i.type})`).join(", ");

  return `
AVAILABLE INTEGRATIONS: ${namesList}

You MUST use these integrations to fulfill the user's request.

TOOLS:
- listIntegrations() - see all available integrations
- findIntegration(name) - check if a specific integration exists
- inspectIntegration(name) - get details (tools for MCP, schema for GraphQL)

WORKFLOW:
1. Call listIntegrations() or findIntegration() to see what's available
2. Call inspectIntegration(name) to discover what the integration provides
3. Write code using the discovered capabilities

DO NOT generate code that assumes capabilities exist - always call inspectIntegration first.
`;
};

/**
 * Generates documentation for discovery mode (no integrations provided).
 * Agent must discover what's available via tools.
 */
const getDiscoveryModeDocs = (): string => {
  return `
INTEGRATION DISCOVERY MODE:
No integrations were provided. You must discover what's available.

TOOLS:
- getOrganizationIntegrations() - list org-specific integrations (check first)
- getGlobalIntegrations() - list first-party registry integrations
- findIntegration(name) - search for a specific integration by name
- inspectIntegration(name) - get details (tools for MCP, schema for GraphQL)
- manageMcpIntegration(need) - set up a new integration (last resort)

WORKFLOW:
1. Call findIntegration(name) to check if the integration you need exists
2. If not found, call getOrganizationIntegrations() then getGlobalIntegrations()
3. Call inspectIntegration(name) to discover what the integration provides
4. If no integration exists, call manageMcpIntegration({ need: "service-name" })
5. Write code using the discovered capabilities

DO NOT skip discovery. DO NOT assume any integrations exist.
DO NOT generate code until you've confirmed the integration exists via inspectIntegration.

Example flow for "get my GitHub PRs":
1. Call findIntegration("github") -> check if GitHub integration exists
2. If not found, try getOrganizationIntegrations() and getGlobalIntegrations()
3. Call inspectIntegration("github") -> discover tools or schema
4. NOW write code using the discovered capabilities
`;
};

/**
 * Generates documentation for integrations (MCP, GraphQL, and OpenAPI).
 *
 * IMPORTANT: The agent must use inspectIntegration to discover what each integration offers.
 */
const getIntegrationDocs = (integrations: IntegrationInfo[]): string => {
  if (integrations.length === 0) return "";

  const mcpIntegrations = integrations.filter((i) => i.type === "mcp");
  const graphqlIntegrations = integrations.filter((i) => i.type === "graphql");
  const openapiIntegrations = integrations.filter((i) => i.type === "openapi");

  let docs = "";

  if (mcpIntegrations.length > 0) {
    const validNames = mcpIntegrations.map((i) => `"${i.name}"`).join(", ");
    const exampleName = mcpIntegrations[0]?.name || "my-mcp-server";

    docs += `
MCP INTEGRATIONS:
Available integration names: ${validNames}

CRITICAL - getMcpClient REQUIREMENTS:
1. The argument MUST be one of the exact integration names listed above: ${validNames}
2. You MUST await the call - getMcpClient returns a Promise
3. DO NOT invent or guess integration names - only use the names listed above

  const client = await integrations.getMcpClient("${exampleName}");  // Correct - uses exact name from list
  const client = integrations.getMcpClient("${exampleName}");        // Wrong - missing await!
  const client = await integrations.getMcpClient("some-other-name"); // Wrong - not in available list!

USAGE:
1. Call inspectIntegration({ integrationName: "${exampleName}" }) to discover tools
2. const client = await integrations.getMcpClient("${exampleName}");  // Use exact name from Available list
3. const result = await client.callTool({ name: "tool_name", arguments: {...} });
4. const data = JSON.parse(result.content[0]?.text || "{}");
`;
  }

  if (graphqlIntegrations.length > 0) {
    const validNames = graphqlIntegrations.map((i) => `"${i.name}"`).join(", ");
    const exampleName = graphqlIntegrations[0]?.name || "my-graphql-api";

    docs += `
GRAPHQL INTEGRATIONS:
Available integration names: ${validNames}

CRITICAL - getGraphQLClient REQUIREMENTS:
1. The argument MUST be one of the exact integration names listed above: ${validNames}
2. You MUST await the call - getGraphQLClient returns a Promise
3. DO NOT invent or guess integration names - only use the names listed above

USAGE:
1. Call inspectIntegration({ integrationName: "${exampleName}" }) to get the GraphQL schema
2. const client = await integrations.getGraphQLClient("${exampleName}");
3. const result = await client.request(\`query { ... }\`, { variables: { ... } });

IMPORTANT: Your GraphQL queries MUST be valid against the schema returned by inspectIntegration.
`;
  }

  if (openapiIntegrations.length > 0) {
    const validNames = openapiIntegrations.map((i) => `"${i.name}"`).join(", ");
    const exampleName = openapiIntegrations[0]?.name || "my-rest-api";

    docs += `
OPENAPI INTEGRATIONS:
Available integration names: ${validNames}

CRITICAL - getOpenAPIClient REQUIREMENTS:
1. The argument MUST be one of the exact integration names listed above: ${validNames}
2. You MUST await the call - getOpenAPIClient returns a Promise
3. DO NOT invent or guess integration names - only use the names listed above

USAGE:
1. Call inspectIntegration({ integrationName: "${exampleName}" }) to get the OpenAPI spec and operations
2. const client = await integrations.getOpenAPIClient("${exampleName}");
3. const result = await client.request("GET", "/users/{userId}", { userId: "123" });
4. const created = await client.request("POST", "/users", {}, { name: "John" });

PATH PARAMETERS: Use placeholders like {paramName} in the path, pass values in params object.
QUERY PARAMETERS: Any params not in the path become query parameters.
REQUEST BODY: Pass as the 4th argument for POST, PUT, PATCH methods.

IMPORTANT: Your method+path combinations MUST be valid against the spec returned by inspectIntegration.
`;
  }

  return docs;
};

export type SystemPromptOptions = {
  /** First-party integrations with dedicated libraries (Gmail, Calendar, etc.) */
  integrations?: string[];
  /** Configurable integrations (MCP servers or GraphQL endpoints) */
  providedIntegrations?: IntegrationInfo[];
};

export const SYSTEM_PROMPT = (options: SystemPromptOptions | string[] = {}): string => {
  // Support legacy array-only signature
  const { integrations = [], providedIntegrations = [] } = Array.isArray(options)
    ? { integrations: options, providedIntegrations: [] }
    : options;

  const standardDocs = integrations
    .map((id) => getStandardIntegrationDocs(id))
    .filter((doc): doc is IntegrationDocs => doc !== null);

  const hasStandardIntegrations = standardDocs.length > 0;
  const hasProvidedIntegrations = providedIntegrations.length > 0;
  const hasAnyIntegrations = hasStandardIntegrations || hasProvidedIntegrations;

  const standardIntegrationsSection = hasStandardIntegrations
    ? `
BUILT-IN INTEGRATIONS (NOT MCP/GraphQL):
These are direct API integrations with known interfaces. Use the specific getter functions.
Do NOT use getMcpClient() or inspectIntegration for these - they have dedicated methods.

Available integrations:
${standardDocs
  .map((doc, idx) => {
    let entry = `${idx + 1}. ${doc.id} (use integrations.${doc.functionName}())\n${doc.usageExample}`;
    if (doc.docsUrl) {
      entry += `\n   Docs: ${doc.docsUrl}`;
    }
    return entry;
  })
  .join("\n\n")}
`
    : "";

  const dynamicIntegrationsSection = hasProvidedIntegrations
    ? `${getIntegrationDocs(providedIntegrations)}${getProvidedIntegrationsDocs(providedIntegrations)}`
    : getDiscoveryModeDocs();

  const rules = validationRules;
  const sandboxRestrictions = `
SYSTEM CONSTRAINTS:
The following is a list of eslint rules which will run against your code. These will cause an error if violated.
${rules.map((r: string) => `- ${r}`).join("\n")}

${hasAnyIntegrations ? "NOTE: Integrations provide REAL data. Do not mock." : "NOTE: Use discovery tools to find real integrations."}
`;

  const showInspectGuidance = hasProvidedIntegrations || !hasAnyIntegrations;
  const toolGuidance = `
TOOL USAGE GUIDANCE:
${showInspectGuidance ? `- inspectIntegration: CRITICAL. You MUST use this to inspect the schema/tools of an integration BEFORE generating code. Do not hallucinate capabilities.\n` : ""}- writeCode: Use this ONLY after you have gathered all necessary information. ${showInspectGuidance ? "If you have not inspected the integration yet, DO NOT use writeCode." : ""}
`.trim();

  return `You are an expert TypeScript code generator that creates FULLY WORKING subroutines.

YOUR RESPONSIBILITY:
You must EXECUTE the user's intent completely. When a user asks "get my GitHub PRs", they want code that FETCHES real PRs from GitHub - not code that accepts PRs as input and transforms them.

NEVER generate mock, placeholder, or pass-through code.
NEVER generate code that expects the user to provide data they asked YOU to fetch.
ALWAYS use tools to discover/setup integrations BEFORE generating code that uses them.

TECHNICAL REQUIREMENTS:
1. Start your code with: import type { Integrations } from "@subroutine/integration-types";
2. Define TypeScript interfaces for Inputs and Outputs based on the schemas
3. Export an async function called "main" with signature: export async function main(inputs: Inputs, context: { integrations: Integrations }): Promise<Outputs>
4. Code must be clean, efficient, and production-ready TypeScript
5. Handle edge cases with proper validation and error messages
6. Use the actual types you define - no any types
7. NEVER use fetch() or make direct network requests - use integrations instead${hasAnyIntegrations ? "\n8. Use the available integrations to interact with external services" : ""}
9. You may import "zod" from "zod" if you need runtime validation (e.g. import { z } from "zod";)
${sandboxRestrictions}
${toolGuidance}
${standardIntegrationsSection}
${dynamicIntegrationsSection}

TYPE DEFINITIONS (reference for available integration methods):
\`\`\`typescript
${getIntegrationTypesContent()}
\`\`\`

Use the writeCode tool to submit your code. The tool will validate it and provide feedback if there are issues.

EXAMPLE (simple, no integrations needed):
\`\`\`typescript
import type { Integrations } from "@subroutine/integration-types";

type Inputs = { x?: number; y?: number };
type Outputs = { result: number; calculation: string };

export async function main(inputs: Inputs, { integrations }: { integrations: Integrations }): Promise<Outputs> {
  const x = inputs.x ?? 0;
  const y = inputs.y ?? 0;
  return { result: x + y, calculation: \`\${x} + \${y} = \${x + y}\` };
}
\`\`\`

EXAMPLE (using Gmail integration):
\`\`\`typescript
import type { Integrations } from "@subroutine/integration-types";

type Inputs = { maxResults?: number };
type Outputs = { messageCount: number; messages: Array<{ id: string; threadId: string }> };

export async function main(inputs: Inputs, { integrations }: { integrations: Integrations }): Promise<Outputs> {
  const gmail = await integrations.getGmail();
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: inputs.maxResults ?? 10
  });
  const messages = response.data.messages ?? [];
  return { messageCount: messages.length, messages };
}
\`\`\``;
};

type PromptOptions = {
  shouldGenerateInputs?: boolean;
};

export const CODE_GENERATION_USER_PROMPT = (request: string, options?: PromptOptions): string => {
  let prompt = `Generate a TypeScript subroutine for: ${request}

CRITICAL INSTRUCTION:
Your goal is to create a REUSABLE, ABSTRACTED function that can be retrieved and used later for similar tasks.
- EXTRACT specific values, IDs, search terms, or parameters from the user's request into the "Inputs" schema.
- DO NOT hardcode these specific values in the function body. The function logic should be generic.
- Example: If asked to "add 5 and 10", generate a function that accepts two numbers as inputs, NOT a function that returns 5 + 10.
- Example: If asked to "get the contents of repo my_stuff", generate a function that takes \`repoName\` as input.
- YOUR inputsSchema MUST MATCH THE input type of your main function. In this case, you should also have generatedInputs of {x: 5, y: 10}

TOOL USAGE REQUIREMENTS:
When calling the \`writeCode\` tool, you MUST:
1. \`inputsSchema\`: Provide a valid JSON Schema that strictly matches your TypeScript \`type Inputs\`.
   - If \`type Inputs\` has fields, \`inputsSchema\` MUST have corresponding properties.
2. \`code\`: The abstracted TypeScript code.`;

  if (options?.shouldGenerateInputs) {
    prompt += `\n3. \`generatedInputs\`: You accepted "shouldGenerateInputs=true".
   - You MUST populate this field with the specific values from the user's request.
   - Example: { "num1": 5, "num2": 10 } or { "repoName": "my_stuff" }
   - This object MUST satisfy the \`inputsSchema\`.`;
  }

  return prompt;
};
