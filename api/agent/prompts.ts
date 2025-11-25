type IntegrationDocs = {
  id: string;
  functionName: string;
  typeExample: string;
  usageExample: string;
  docsUrl?: string;
};

export type McpIntegrationInfo = {
  name: string;
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
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
 */
const getMcpIntegrationDocs = (mcpIntegrations: McpIntegrationInfo[]): string => {
  if (mcpIntegrations.length === 0) return "";

  const validNames = mcpIntegrations.map((mcp) => `"${mcp.name}"`).join(", ");

  const mcpDocs = mcpIntegrations
    .map((mcp) => {
      const toolsList = mcp.tools
        .map((tool) => {
          let toolDoc = `      - ${tool.name}`;
          if (tool.description) {
            toolDoc += `: ${tool.description}`;
          }
          return toolDoc;
        })
        .join("\n");

      return `   - "${mcp.name}":
${toolsList}`;
    })
    .join("\n\n");

  return `
MCP INTEGRATIONS (REAL EXTERNAL ACCESS):
You have access to MCP (Model Context Protocol) servers via integrations.getMcpClient(name).
These integrations connect to REAL external services - they are NOT mocked.

CRITICAL:
- MCP tools make REAL API calls to external services (GitHub, Slack, etc.)
- DO NOT mock or simulate data - actually call the MCP tools to get real results
- The sandbox proxies these calls securely - you have real external access through MCP

IMPORTANT: Only the following MCP integration names are valid: ${validNames}
Using any other name will result in an error at runtime.

Type Declaration:
declare const integrations: {
  getMcpClient(name: string): Promise<{
    listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema: object }> }>;
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    }>;
  }>;
};

Available MCP integrations and their tools:
${mcpDocs}

Example using MCP integration:
// Get the MCP client - this connects to a REAL external service
const client = await integrations.getMcpClient("${mcpIntegrations[0]?.name || "my-mcp-server"}");

// Call a tool - this makes a REAL API call, returns REAL data
const result = await client.callTool({
  name: "toolName",
  arguments: { param1: "value1", param2: 123 }
});

// The result contains content blocks with REAL data from the external service
// For text results: result.content[0].text
// Check result.isError for error responses
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
AVAILABLE INTEGRATIONS:
Your code has access to external integrations via the global "integrations" object. These integrations allow you to interact with external services without imports.

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
