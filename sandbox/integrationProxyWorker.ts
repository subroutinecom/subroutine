/// <reference lib="deno.worker" />

import { type CallRequest, type CallResponse, RemoteProxyServer } from "./remoteProxy";
import {
  createCalendarClient,
  type CalendarConfig,
  type CalendarTokens,
} from "./integrations/calendar/mod";
import { createGmailClient, type GmailConfig, type GmailTokens } from "./integrations/gmail/mod";
import { createMcpClient, buildMcpToolProxy, toGetterName } from "./integrations/mcp/mod";
import type { CalendarAPI } from "./integrations/calendar/types";
import type { GmailAPI } from "./integrations/gmail/types";
import type { SandboxIntegrationPayload } from "./types.ts";

interface S3API {
  listBuckets(): Promise<{ buckets: string[] }>;
}

interface GithubAPI {
  me(): Promise<{ login: string }>;
}

interface PingAPI {
  ping(message: string): Promise<{ echo: string; timestamp: number }>;
}

type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | { kind: "rpc_result"; payload: CallResponse };

let messagePort: MessagePort | null = null;

const buildDefaultServer = async (): Promise<RemoteProxyServer<object>> => {
  const defaultServer = new RemoteProxyServer<object>();

  const mockGmail: GmailAPI = {
    users: {
      labels: {
        list: async (opts: { userId: string }) => ({
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

  defaultServer.registerSingleton("getGmail", async () => mockGmail as unknown as object);

  const mockCalendar: CalendarAPI = {
    calendarList: {
      list: async () => ({
        data: {
          items: [
            { id: "primary", summary: "Primary Calendar" },
            { id: "holidays@example.com", summary: "Holidays" },
          ],
        },
      }),
    },
  } as unknown as CalendarAPI;

  defaultServer.registerSingleton("getCalendar", async () => mockCalendar as unknown as object);

  defaultServer.registerSingleton("getS3", async () => {
    const s3: S3API = {
      listBuckets: async () => ({ buckets: ["photos", "backups"] }),
    };
    return s3 as unknown as object;
  });

  defaultServer.registerSingleton("getGithub", async () => {
    const gh: GithubAPI = {
      me: async () => ({ login: "octocat" }),
    };
    return gh as unknown as object;
  });

  defaultServer.registerSingleton("getPing", async () => {
    const ping: PingAPI = {
      ping: async (message: string) => ({
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
  const server = new RemoteProxyServer<object>();
  await Promise.all(
    integrations.map(async (integration) => {
      // Check if this is an MCP integration (identified by presence of mcpConfig)
      if (integration.mcpConfig) {
        const mcpConfig = integration.mcpConfig;
        const getterName = toGetterName(integration.name);

        try {
          // Create MCP client and connect
          const client = await createMcpClient(mcpConfig, {
            clientName: `subroutine-${integration.name}`,
          });

          // Build tool proxy
          const mcpProxy = await buildMcpToolProxy(client);

          // Register as singleton with derived getter name
          server.registerSingleton(getterName, async () => mcpProxy as unknown as object);

          console.log(
            `MCP integration '${integration.name}' registered as ${getterName}() with ${(await mcpProxy._listTools()).length} tools`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to connect to MCP server '${integration.name}': ${message}`);
        }

        return;
      }

      // Handle traditional OAuth-based integrations
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

          server.registerSingleton("getGmail", async () => gmail as unknown as object);
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

          server.registerSingleton("getCalendar", async () => calendar as unknown as object);
          break;
        }
        case "mock_oauth": {
          if (!integration.account) {
            throw new Error("Mock OAuth integration requires credentials");
          }
          const viewerId = integration.account.accountIdentifier ?? integration.account.userId;
          server.registerSingleton(
            "getMockOAuth",
            async () =>
              ({
                ping: async (message: string) => ({
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

    messagePort.onmessage = async (portEvent: MessageEvent<WireMessage>) => {
      const wireMsg = portEvent.data;
      if (!wireMsg || wireMsg.kind !== "rpc") return;

      const req = wireMsg.payload;
      const res = await server.handle(JSON.parse(JSON.stringify(req)));
      const wire: WireMessage = {
        kind: "rpc_result",
        payload: JSON.parse(JSON.stringify(res)) as CallResponse,
      };
      messagePort!.postMessage(wire);
    };

    (self as unknown as { postMessage: (data: unknown) => void }).postMessage({
      type: "integration_proxy_ready",
    });
  }
});
