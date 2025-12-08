/// <reference lib="deno.worker" />

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createCalendarClient,
  type CalendarConfig,
  type CalendarTokens,
} from "./integrations/calendar/mod";
import type { CalendarAPI } from "./integrations/calendar/types";
import { createGmailClient, type GmailConfig, type GmailTokens } from "./integrations/gmail/mod";
import type { GmailAPI } from "./integrations/gmail/types";
import { createGraphQLClient, type GraphQLClient } from "./integrations/graphql/mod";
import { createMcpClient } from "./integrations/mcp/mod";
import { createOpenAPIClient, type OpenAPIClient } from "./integrations/openapi/mod";
import { RemoteProxyServer, type CallRequest, type CallResponse } from "./remoteProxy";
import type { SandboxIntegrationPayload } from "./types.ts";

interface S3API {
  listBuckets(): { buckets: string[] };
}

interface GithubAPI {
  me(): { login: string };
}

interface PingAPI {
  ping(message: string): { echo: string; timestamp: number };
}

type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | { kind: "rpc_result"; payload: CallResponse };

let messagePort: MessagePort | null = null;

const buildDefaultServer = (): RemoteProxyServer<object> => {
  const defaultServer = new RemoteProxyServer<object>();

  const mockGmail: GmailAPI = {
    users: {
      labels: {
        list: (opts: { userId: string }) => ({
          data: {
            labels:
              opts.userId === "me"
                ? [
                    { id: "INBOX", name: "INBOX" },
                    { id: "STARRED", name: "STARRED" },
                  ]
                : [],
          },
        }),
      },
    },
  } as unknown as GmailAPI;

  defaultServer.registerSingleton("getGmail", () => mockGmail as unknown as object);

  const mockCalendar: CalendarAPI = {
    calendarList: {
      list: () => ({
        data: {
          items: [
            { id: "primary", summary: "Primary Calendar" },
            { id: "holidays@example.com", summary: "Holidays" },
          ],
        },
      }),
    },
  } as unknown as CalendarAPI;

  defaultServer.registerSingleton("getCalendar", () => mockCalendar as unknown as object);

  defaultServer.registerSingleton("getS3", () => {
    const s3: S3API = {
      listBuckets: () => ({ buckets: ["photos", "backups"] }),
    };
    return s3 as unknown as object;
  });

  defaultServer.registerSingleton("getGithub", () => {
    const gh: GithubAPI = {
      me: () => ({ login: "octocat" }),
    };
    return gh as unknown as object;
  });

  defaultServer.registerSingleton("getPing", () => {
    const ping: PingAPI = {
      ping: (message: string) => ({
        echo: message,
        timestamp: Date.now(),
      }),
    };
    return ping as unknown as object;
  });

  return defaultServer;
};

const buildServerForIntegrations = async (
  integrations: SandboxIntegrationPayload[]
): Promise<RemoteProxyServer<object>> => {
  const buildStart = Date.now();
  console.log(`[IntegrationProxy] Building server for ${integrations.length} integrations`);

  const server = new RemoteProxyServer<object>();

  // Store MCP clients by integration name for the getMcpClient getter
  const mcpClients = new Map<string, Client>();
  const mcpErrors = new Map<string, Error>();

  const mcpIntegrations = integrations.filter((integration) => integration.mcpConfig);
  console.log(`[IntegrationProxy] Found ${mcpIntegrations.length} MCP integrations to connect`);

  // First, connect all MCP integrations
  await Promise.all(
    mcpIntegrations.map(async (integration) => {
      const integrationStart = Date.now();
      const mcpConfig = integration.mcpConfig!;
      console.log(`[IntegrationProxy] Connecting to MCP integration '${integration.name}'...`);
      try {
        const client = await createMcpClient(mcpConfig, {
          clientName: `subroutine-${integration.name}`,
        });
        mcpClients.set(integration.name, client);
        console.log(
          `[IntegrationProxy] MCP '${integration.name}' client created after ${Date.now() - integrationStart}ms`
        );

        // Log available tools for debugging
        const toolsStart = Date.now();
        const { tools } = await client.listTools();
        console.log(
          `[IntegrationProxy] MCP '${integration.name}' listTools completed in ${Date.now() - toolsStart}ms, found ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        mcpErrors.set(
          integration.name,
          new Error(`Failed to connect to MCP server '${integration.name}': ${errorMessage}`)
        );
        console.error(
          `[IntegrationProxy] MCP '${integration.name}' failed after ${Date.now() - integrationStart}ms: ${errorMessage}`
        );
      }
    })
  );

  console.log(
    `[IntegrationProxy] All MCP integrations processed after ${Date.now() - buildStart}ms`
  );

  // Register a single getMcpClient getter that returns MCP clients by name
  if (mcpClients.size > 0 || mcpErrors.size > 0) {
    server.register("getMcpClient", (name: unknown) => {
      const integrationName = String(name);

      // Check if there was a connection error
      const connectionError = mcpErrors.get(integrationName);
      if (connectionError) {
        throw connectionError;
      }

      // Get the client
      const client = mcpClients.get(integrationName);
      if (!client) {
        const availableNames = [...mcpClients.keys()].join(", ") || "none";
        throw new Error(
          `MCP integration '${integrationName}' not found. Available: ${availableNames}`
        );
      }

      return client as unknown as object;
    });
  }

  // Store GraphQL clients by integration name
  const graphqlClients = new Map<string, GraphQLClient>();
  const graphqlErrors = new Map<string, Error>();

  const graphqlIntegrations = integrations.filter((integration) => integration.graphqlConfig);
  console.log(`[IntegrationProxy] Found ${graphqlIntegrations.length} GraphQL integrations`);

  // Create GraphQL clients
  for (const integration of graphqlIntegrations) {
    try {
      const client = createGraphQLClient(integration.graphqlConfig!);
      graphqlClients.set(integration.name, client);
      console.log(`[IntegrationProxy] GraphQL client '${integration.name}' created`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      graphqlErrors.set(
        integration.name,
        new Error(`Failed to create GraphQL client '${integration.name}': ${errorMessage}`)
      );
      console.error(`[IntegrationProxy] GraphQL '${integration.name}' failed: ${errorMessage}`);
    }
  }

  // Register a single getGraphQLClient getter that returns GraphQL clients by name
  if (graphqlClients.size > 0 || graphqlErrors.size > 0) {
    server.register("getGraphQLClient", (name: unknown) => {
      const integrationName = String(name);

      // Check if there was a creation error
      const creationError = graphqlErrors.get(integrationName);
      if (creationError) {
        throw creationError;
      }

      // Get the client
      const client = graphqlClients.get(integrationName);
      if (!client) {
        const availableNames = [...graphqlClients.keys()].join(", ") || "none";
        throw new Error(
          `GraphQL integration '${integrationName}' not found. Available: ${availableNames}`
        );
      }

      return client as unknown as object;
    });
  }

  const openapiClients = new Map<string, OpenAPIClient>();
  const openapiErrors = new Map<string, Error>();

  const openapiIntegrations = integrations.filter((integration) => integration.openapiConfig);
  console.log(`[IntegrationProxy] Found ${openapiIntegrations.length} OpenAPI integrations`);

  for (const integration of openapiIntegrations) {
    try {
      const client = createOpenAPIClient(integration.openapiConfig!);
      openapiClients.set(integration.name, client);
      console.log(`[IntegrationProxy] OpenAPI client '${integration.name}' created`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      openapiErrors.set(
        integration.name,
        new Error(`Failed to create OpenAPI client '${integration.name}': ${errorMessage}`)
      );
      console.error(`[IntegrationProxy] OpenAPI '${integration.name}' failed: ${errorMessage}`);
    }
  }

  if (openapiClients.size > 0 || openapiErrors.size > 0) {
    server.register("getOpenAPIClient", (name: unknown) => {
      const integrationName = String(name);

      const creationError = openapiErrors.get(integrationName);
      if (creationError) {
        throw creationError;
      }

      const client = openapiClients.get(integrationName);
      if (!client) {
        const availableNames = [...openapiClients.keys()].join(", ") || "none";
        throw new Error(
          `OpenAPI integration '${integrationName}' not found. Available: ${availableNames}`
        );
      }

      return client as unknown as object;
    });
  }

  // Handle traditional OAuth-based integrations
  await Promise.all(
    integrations
      .filter((integration) => !integration.mcpConfig && !integration.graphqlConfig && !integration.openapiConfig)
      .map((integration) => {
        switch (integration.provider) {
          case "gmail": {
            if (!integration.account) {
              throw new Error("Gmail integration requires account credentials");
            }
            const authConfig = integration.authConfig as {
              clientId?: string;
              clientSecret?: string;
              redirectUri?: string;
            };
            if (!authConfig.clientId || !authConfig.clientSecret || !authConfig.redirectUri) {
              throw new Error("Gmail integration missing OAuth client configuration");
            }

            const config: GmailConfig = {
              clientId: authConfig.clientId,
              clientSecret: authConfig.clientSecret,
              redirectUri: authConfig.redirectUri,
            };

            const tokens: GmailTokens = {
              access_token: integration.account.credentials.accessToken,
              refresh_token: integration.account.credentials.refreshToken,
              token_type: integration.account.credentials.tokenType,
              expiry_date: integration.account.credentials.expiresAt,
              scope: integration.account.credentials.scope,
            };

            const gmail = createGmailClient(tokens, config);

            server.registerSingleton("getGmail", () => gmail as unknown as object);
            break;
          }
          case "google_calendar": {
            if (!integration.account) {
              throw new Error("Google Calendar integration requires account credentials");
            }
            const authConfig = integration.authConfig as {
              clientId?: string;
              clientSecret?: string;
              redirectUri?: string;
            };
            if (!authConfig.clientId || !authConfig.clientSecret || !authConfig.redirectUri) {
              throw new Error("Google Calendar integration missing OAuth client configuration");
            }

            const config: CalendarConfig = {
              clientId: authConfig.clientId,
              clientSecret: authConfig.clientSecret,
              redirectUri: authConfig.redirectUri,
            };

            const tokens: CalendarTokens = {
              access_token: integration.account.credentials.accessToken,
              refresh_token: integration.account.credentials.refreshToken,
              token_type: integration.account.credentials.tokenType,
              expiry_date: integration.account.credentials.expiresAt,
              scope: integration.account.credentials.scope,
            };

            const calendar = createCalendarClient(tokens, config);

            server.registerSingleton("getCalendar", () => calendar as unknown as object);
            break;
          }
          case "mock_oauth": {
            if (!integration.account) {
              throw new Error("Mock OAuth integration requires credentials");
            }
            const viewerId = integration.account.accountIdentifier ?? integration.account.userId;
            server.registerSingleton(
              "getMockOAuth",
              () =>
                ({
                  ping: (message: string) => ({
                    echo: message,
                    viewerId,
                  }),
                }) as unknown as object
            );
            break;
          }
          default:
            throw new Error(`Unsupported integration provider: ${integration.provider}`);
        }
      })
  );

  return server;
};

addEventListener("message", async (ev: Event) => {
  const msg = (ev as MessageEvent<{ type: string; integrations?: unknown }>).data;

  if (msg && msg.type === "connect") {
    const ports = (ev as MessageEvent).ports;
    if (!ports || ports.length === 0) {
      return;
    }

    messagePort = ports[0];
    const providedIntegrations = Array.isArray(msg.integrations)
      ? (msg.integrations as SandboxIntegrationPayload[])
      : [];

    const server =
      providedIntegrations.length > 0
        ? await buildServerForIntegrations(providedIntegrations)
        : await buildDefaultServer();

    messagePort.onmessage = (portEvent: MessageEvent<WireMessage>) => {
      const wireMsg = portEvent.data;
      if (!wireMsg || wireMsg.kind !== "rpc") return;

      (async () => {
        const req = wireMsg.payload;
        const res = await server.handle(JSON.parse(JSON.stringify(req)));

        const wire: WireMessage = {
          kind: "rpc_result",
          payload: JSON.parse(JSON.stringify(res)) as CallResponse,
        };
        messagePort!.postMessage(wire);
      })();
    };

    (self as unknown as { postMessage: (data: unknown) => void }).postMessage({
      type: "integration_proxy_ready",
    });
  }
});
