type IntegrationDocs = {
  id: string;
  functionName: string;
  typeExample: string;
  usageExample: string;
  docsUrl?: string;
};

/**
 * Simplified MCP integration info for the agent prompt.
 * Only contains identifying information - agent uses listMcpTools to discover tools.
 */
export type McpIntegrationInfo = {
  id: string;
  name: string;
};

const getIntegrationDocs = (integrationId: string): IntegrationDocs | null => {
  switch (integrationId) {
    case "gmail":
      return {
        id: "gmail",
        functionName: "getGmail",
        typeExample: `getGmail(): Promise<{
    users: {
      labels: { list(opts: { userId: string }): Promise<{ data: { labels?: Array<{ id?: string; name?: string }> } }> };
      messages: { list(opts: { userId: string; maxResults?: number }): Promise<{ data: { messages?: Array<{ id?: string }> } }> };
    };
  }>`,
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
        typeExample: `getCalendar(): Promise<{
    calendarList: { list(): Promise<{ data: { items?: Array<{ id?: string; summary?: string }> } }> };
    events: {
      list(opts: { calendarId: string; maxResults?: number }): Promise<{ data: { items?: Array<{ id?: string; summary?: string; start?: any; end?: any }> } }>;
      insert(opts: { calendarId: string; requestBody: any }): Promise<{ data: any }>;
    };
  }>`,
        usageExample: `const calendar = await integrations.getCalendar();
   const calendars = await calendar.calendarList.list();
   const events = await calendar.events.list({ calendarId: "primary", maxResults: 10 });
   const event = await calendar.events.get({ calendarId: "primary", eventId: eventId });
   const newEvent = await calendar.events.insert({ calendarId: "primary", requestBody: { summary: "Meeting", start: { dateTime: "2024-01-01T10:00:00Z" }, end: { dateTime: "2024-01-01T11:00:00Z" } } });`,
        docsUrl: "https://googleapis.dev/nodejs/googleapis/latest/calendar/index.html",
      };

    // Note: GitHub integration removed - use MCP integration instead (e.g., getMcpClient("github"))

    default:
      return null;
  }
};

/**
 * Generates documentation for MCP integrations.
 * MCP integrations use the standard MCP client interface with listTools() and callTool().
 *
 * IMPORTANT: This now only lists integration names. The agent must use the listMcpTools
 * tool to discover what tools each integration offers.
 */
const getMcpIntegrationDocs = (mcpIntegrations: McpIntegrationInfo[]): string => {
  if (mcpIntegrations.length === 0) return "";

  const validNames = mcpIntegrations.map((mcp) => `"${mcp.name}"`).join(", ");
  const exampleName = mcpIntegrations[0]?.name || "my-mcp-server";

  return `
MCP INTEGRATIONS (REAL EXTERNAL ACCESS):
CRITICAL: "integrations" is a GLOBAL object - it is NOT part of ctx!
You access MCP servers via: integrations.getMcpClient(name)

These integrations connect to REAL external services - they are NOT mocked.
MCP tools make REAL API calls to external services (GitHub, Slack, etc.)
DO NOT mock or simulate data - actually call the MCP tools to get real results.
The sandbox proxies these calls securely - you have real external access through MCP.

AVAILABLE MCP INTEGRATIONS: ${validNames}
Using any other name will result in an error at runtime.

CRITICAL - DISCOVERING TOOLS (REQUIRED STEP):
You do NOT know what tools these MCP integrations provide. Tool names vary between servers.
DO NOT GUESS tool names - you MUST call listMcpTools first to discover the actual tools.

Before writing ANY code that uses an MCP integration:
1. FIRST call: listMcpTools({ integrationName: "${exampleName}" })
2. WAIT for the response to see the actual tool names and their input schemas
3. ONLY THEN write code using the exact tool names returned

This will return the list of available tools, their descriptions, and input schemas.

HOW TO USE MCP INTEGRATIONS IN YOUR CODE:
1. Get the MCP client: const client = await integrations.getMcpClient("${exampleName}");
2. Call a tool using callTool(): const result = await client.callTool({ name: "toolName", arguments: { ... } });
3. Read the result: result.content[0].text contains the response (often JSON string)

WRONG - DO NOT DO THIS:
- Guessing tool names like "list_repos", "get_user" // WRONG! Call listMcpTools first to get actual names
- Writing code before calling listMcpTools // WRONG! Always discover tools first
- ctx.integrations... // WRONG! integrations is NOT in ctx. ctx is just Record<string, unknown>
- interface Context { integrations: {...} } // WRONG! Never put integrations in Context type
- integrations.github.list_repos() // WRONG: no direct method calls, use getMcpClient + callTool
- integrations.getGithub().list_repos() // WRONG: no magic getters, use getMcpClient("github")

CORRECT PATTERN:
const client = await integrations.getMcpClient("${exampleName}");
const result = await client.callTool({ name: "some_tool", arguments: { /* params */ } });
const data = JSON.parse(result.content[0].text || "{}"); // Parse if JSON response

COMPLETE EXAMPLE with MCP integration:

declare const integrations: {
  getMcpClient(name: string): Promise<{
    listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema: object }> }>;
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    }>;
  }>;
};

// IMPORTANT: Context is just an empty record. Do NOT add integrations to Context!
type Context = Record<string, unknown>;
type Inputs = { /* your inputs */ };
type Outputs = { /* your outputs */ };

export async function main(ctx: Context, inputs: Inputs): Promise<Outputs> {
  // integrations is a GLOBAL variable (declared above), NOT part of ctx!
  const client = await integrations.getMcpClient("${exampleName}");

  // Call a tool using callTool() method
  const result = await client.callTool({
    name: "some_tool", // Use tool name from listMcpTools result
    arguments: { /* tool parameters */ }
  });

  // Check for errors
  if (result.isError) {
    throw new Error(result.content[0]?.text || "MCP tool call failed");
  }

  // Parse the response (MCP tools return content array with text)
  const responseText = result.content[0]?.text || "{}";
  const data = JSON.parse(responseText);

  return { /* map data to your Outputs type */ };
}
`;
};

export type SystemPromptOptions = {
  integrations?: string[];
  mcpIntegrations?: McpIntegrationInfo[];
};

export const SYSTEM_PROMPT = (options: SystemPromptOptions | string[] = {}): string => {
  // Support legacy array-only signature
  const { integrations = [], mcpIntegrations = [] } = Array.isArray(options)
    ? { integrations: options, mcpIntegrations: [] }
    : options;

  const integrationDocs = integrations
    .map((id) => getIntegrationDocs(id))
    .filter((doc): doc is IntegrationDocs => doc !== null);

  const hasStandardIntegrations = integrationDocs.length > 0;
  const hasMcpIntegrations = mcpIntegrations.length > 0;
  const hasAnyIntegrations = hasStandardIntegrations || hasMcpIntegrations;

  let integrationsSection = "";

  if (hasStandardIntegrations) {
    const typeDeclarations = integrationDocs.map((doc) => `  ${doc.typeExample};`).join("\n");

    const integrationsList = integrationDocs
      .map((doc, idx) => {
        let entry = `${idx + 1}. ${doc.id}\n   ${doc.usageExample}`;
        if (doc.docsUrl) {
          entry += `\n   Docs: ${doc.docsUrl}`;
        }
        return entry;
      })
      .join("\n\n");

    const exampleIntegration = integrationDocs[0];

    integrationsSection = `
BUILT-IN INTEGRATIONS (NOT MCP):
These are direct API integrations with known interfaces. Use the specific getter functions shown below.
Do NOT use getMcpClient() or listMcpTools for these - they have dedicated methods.

TypeScript Type Declaration:
Since integrations is a global object not known to TypeScript, declare it at the top of your code:
declare const integrations: {
${typeDeclarations}
};

Available integrations:
${integrationsList}

Example using integrations:
declare const integrations: {
  ${exampleIntegration.typeExample};
};

type Context = Record<string, unknown>;
type Inputs = Record<string, unknown>;
type Outputs = { result: unknown };

export async function main(ctx: Context, inputs: Inputs): Promise<Outputs> {
  const integration = await integrations.${exampleIntegration.functionName}();
  return { result: integration };
}
`;
  }

  // Add MCP integrations section
  if (hasMcpIntegrations) {
    integrationsSection += getMcpIntegrationDocs(mcpIntegrations);
  }

  // Build the sandbox restrictions section
  const sandboxRestrictions = hasAnyIntegrations
    ? `
SANDBOX RESTRICTIONS:
- You CANNOT use fetch(), XMLHttpRequest, or direct HTTP calls - they will fail
- ALL external API calls MUST go through the "integrations" object
- The integrations below provide REAL access to external services - use them!
- DO NOT mock or simulate external data - the integrations return real data`
    : `
SANDBOX RESTRICTIONS:
- Your code runs in an isolated sandbox with NO network access
- You CANNOT use fetch(), XMLHttpRequest, or any direct HTTP/network calls - they will fail
- No external integrations are available for this subroutine`;

  return `You are an expert TypeScript code generator. Your task is to generate executable TypeScript code subroutines based on user requests.

CRITICAL REQUIREMENTS:
1. Define TypeScript interfaces for inputs and outputs based on the schemas
2. Export an async function called "main" that uses these types
3. The function signature must be: export async function main(ctx: Context, inputs: Inputs): Promise<Outputs>
4. Code must be clean, efficient, and production-ready TypeScript
5. Do not include any imports or external dependencies - code runs in an isolated sandbox
6. Handle edge cases with proper validation and error messages
7. Use the actual types you define - no any types
8. NEVER use fetch() or make direct network requests - use integrations instead${hasAnyIntegrations ? "\n9. Use the available integrations to interact with external services" : ""}
${sandboxRestrictions}
${integrationsSection}
Use the generateSubroutine tool to submit your code. The tool will validate it and provide feedback if there are issues. You can revise and resubmit based on the feedback.

EXAMPLE:
For "add two numbers", call generateSubroutine with:
- inputsSchema: { "type": "object", "properties": { "x": { "type": "number", "description": "First number" }, "y": { "type": "number", "description": "Second number" } }, "required": [] }
- outputsSchema: { "type": "object", "properties": { "result": { "type": "number", "description": "Sum" }, "calculation": { "type": "string", "description": "Calculation string" } }, "required": ["result", "calculation"] }
- code: "type Context = Record<string, unknown>;\n\ntype Inputs = {\n  x?: number;\n  y?: number;\n};\n\ntype Outputs = {\n  result: number;\n  calculation: string;\n};\n\nexport async function main(ctx: Context, inputs: Inputs): Promise<Outputs> {\n  const x = inputs.x ?? 0;\n  const y = inputs.y ?? 0;\n  const sum = x + y;\n  return { result: sum, calculation: \`\${x} + \${y} = \${sum}\` };\n}"`;
};

type PromptOptions = {
  needsImmediateInputs?: boolean;
};

export const CODE_GENERATION_USER_PROMPT = (request: string, options?: PromptOptions): string => {
  let prompt = `Generate a TypeScript subroutine for: ${request}`;

  if (options?.needsImmediateInputs) {
    prompt += `\n\nAdditionally, produce an "immediateInputs" JSON object that satisfies your Inputs schema and can be used to execute main right away without further clarification. Populate every required field with sensible defaults inferred from the request.`;
  }

  return prompt;
};
