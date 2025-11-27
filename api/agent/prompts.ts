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
 * Generates documentation for when integrations ARE provided.
 * Agent must use the provided integrations.
 */
const getProvidedIntegrationsDocs = (integrationNames: string[]): string => {
  const namesList = integrationNames.map((n) => `"${n}"`).join(", ");

  return `
AVAILABLE INTEGRATIONS: ${namesList}

You MUST use these integrations to fulfill the user's request.
1. Call listMcpTools({ integrationName: "name" }) to discover what tools each integration provides
2. Write code that uses integrations.getMcpClient("name") to access the integration
3. Use client.callTool() to call the discovered tools

DO NOT generate code that assumes tools exist - always call listMcpTools first to see what's available.
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

REQUIRED STEPS when the user's request needs an external service (GitHub, Slack, database, etc.):
1. FIRST call listAvailableIntegrations() to see what's configured
2. If the service you need IS listed -> call listMcpTools to see its tools, then write code
3. If the service you need is NOT listed -> call manageMcpIntegration({ need: "service-name" }) to set it up

DO NOT skip step 1. DO NOT assume any integrations exist.
DO NOT generate code with getMcpClient() until you've confirmed the integration exists.

Example flow for "get my GitHub PRs":
1. Call listAvailableIntegrations() -> returns { integrations: [] } (empty)
2. Call manageMcpIntegration({ need: "github" }) → sets up GitHub integration
3. If authRequired: "api_key" -> tell user they need to provide credentials
4. If authRequired: "none" -> call listMcpTools({ integrationName: "github" }) to see tools
5. NOW write code using the discovered tools
`;
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
MCP INTEGRATIONS:
Available: ${validNames}

TYPE DECLARATIONS (copy these exactly):

type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type McpClient = {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<McpToolResult>;
};

type Integrations = {
  getMcpClient(name: string): Promise<McpClient>;
};

CRITICAL - getMcpClient returns a Promise, you MUST await it:
  ✓ const client = await integrations.getMcpClient("${exampleName}");  // Correct
  ✗ const client = integrations.getMcpClient("${exampleName}");        // Wrong - missing await!

USAGE:
1. Call listMcpTools({ integrationName: "${exampleName}" }) to discover tools
2. const client = await integrations.getMcpClient("${exampleName}");
3. const result = await client.callTool({ name: "tool_name", arguments: {...} });
4. const data = JSON.parse(result.content[0]?.text || "{}");

COMPLETE EXAMPLE:

type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type McpClient = {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<McpToolResult>;
};

type Integrations = {
  getMcpClient(name: string): Promise<McpClient>;
};

type Inputs = { query: string };
type Outputs = { results: unknown[] };

export async function main(integrations: Integrations, inputs: Inputs): Promise<Outputs> {
  const client = await integrations.getMcpClient("${exampleName}");

  const result = await client.callTool({
    name: "search",
    arguments: { q: inputs.query }
  });

  if (result.isError) {
    throw new Error(result.content[0]?.text || "Tool call failed");
  }

  const data = JSON.parse(result.content[0]?.text || "{}");
  return { results: data.items || [] };
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

  if (hasMcpIntegrations) {
    // Provided mode: integrations were explicitly passed
    integrationsSection += getMcpIntegrationDocs(mcpIntegrations);
    integrationsSection += getProvidedIntegrationsDocs(mcpIntegrations.map((mcp) => mcp.name));
  } else {
    // Discovery mode: no MCP integrations provided, agent must discover
    integrationsSection += getDiscoveryModeDocs();
  }

  // Build the sandbox restrictions section
  let sandboxRestrictions: string;
  if (hasAnyIntegrations) {
    sandboxRestrictions = `
SANDBOX RESTRICTIONS:
- You CANNOT use fetch(), XMLHttpRequest, or direct HTTP calls - they will fail
- ALL external API calls MUST go through the "integrations" object
- The integrations provide REAL access to external services - use them!
- DO NOT mock or simulate external data - the integrations return real data`;
  } else if (hasMcpIntegrations === false) {
    // Discovery mode - integrations can be set up
    sandboxRestrictions = `
SANDBOX RESTRICTIONS:
- You CANNOT use fetch(), XMLHttpRequest, or direct HTTP calls - they will fail
- ALL external API calls MUST go through MCP integrations
- Use the discovery tools to find or set up integrations before generating code
- DO NOT mock or simulate external data - use real integrations`;
  } else {
    sandboxRestrictions = `
SANDBOX RESTRICTIONS:
- Your code runs in an isolated sandbox with NO network access
- You CANNOT use fetch(), XMLHttpRequest, or any direct HTTP/network calls - they will fail
- No external integrations are available for this subroutine`;
  }

  return `You are an expert TypeScript code generator that creates FULLY WORKING subroutines.

YOUR RESPONSIBILITY:
You must EXECUTE the user's intent completely. When a user asks "get my GitHub PRs", they want code that FETCHES real PRs from GitHub - not code that accepts PRs as input and transforms them.

NEVER generate mock, placeholder, or pass-through code.
NEVER generate code that expects the user to provide data they asked YOU to fetch.
ALWAYS use tools to discover/setup integrations BEFORE generating code that uses them.

TECHNICAL REQUIREMENTS:
1. Define TypeScript interfaces for Inputs and Outputs based on the schemas
2. Export an async function called "main" that uses these types
3. The function signature must be: export async function main(integrations: Integrations, inputs: Inputs): Promise<Outputs>
4. Define the Integrations type at the top of your code (see examples)
5. Code must be clean, efficient, and production-ready TypeScript
6. Do not include any imports or external dependencies - code runs in an isolated sandbox
7. Handle edge cases with proper validation and error messages
8. Use the actual types you define - no any types
9. NEVER use fetch() or make direct network requests - use integrations instead${hasAnyIntegrations ? "\n10. Use the available integrations to interact with external services" : ""}
${sandboxRestrictions}
${integrationsSection}
Use the generateSubroutine tool to submit your code. The tool will validate it and provide feedback if there are issues. You can revise and resubmit based on the feedback.

EXAMPLE (simple, no integrations needed):
For "add two numbers", call generateSubroutine with:
- inputsSchema: { "type": "object", "properties": { "x": { "type": "number" }, "y": { "type": "number" } }, "required": [] }
- outputsSchema: { "type": "object", "properties": { "result": { "type": "number" }, "calculation": { "type": "string" } }, "required": ["result", "calculation"] }
- code: "type Inputs = { x?: number; y?: number };\\ntype Outputs = { result: number; calculation: string };\\n\\nexport async function main(integrations: unknown, inputs: Inputs): Promise<Outputs> {\\n  const x = inputs.x ?? 0;\\n  const y = inputs.y ?? 0;\\n  return { result: x + y, calculation: \`\${x} + \${y} = \${x + y}\` };\\n}"`;
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
