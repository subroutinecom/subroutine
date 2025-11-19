/// <reference lib="deno.worker" />

import { type CallRequest, type CallResponse, RemoteProxyServer } from "./remoteProxy";
import {
  createGmailIntegration,
  createGmailIntegrationFromSecrets,
  type GmailTokenPayload,
} from "./integrations/gmail/mod";
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

  const gmailIntegration: GmailAPI = await createGmailIntegration();
  defaultServer.registerSingleton(
    "getGmail",
    async () => gmailIntegration as unknown as object,
  );

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
  integrations: SandboxIntegrationPayload[],
): Promise<RemoteProxyServer<object>> => {
  const server = new RemoteProxyServer<object>();
  await Promise.all(
    integrations.map(async (integration) => {
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
          const gmail = await createGmailIntegrationFromSecrets({
            config: {
              clientId: authConfig.clientId,
              clientSecret: authConfig.clientSecret,
              redirectUri: authConfig.redirectUri,
              tokenFile: undefined,
            },
            tokens: mapCredentialsToGmailTokens(integration),
            userId: integration.account.accountIdentifier ?? integration.account.userId,
          });

          server.registerSingleton(
            "getGmail",
            async () => gmail as unknown as object,
          );
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
              }) as unknown as object,
          );
          break;
        }
        default:
          throw new Error(`Unsupported integration provider: ${integration.provider}`);
      }
    }),
  );

  return server;
};

const mapCredentialsToGmailTokens = (
  integration: SandboxIntegrationPayload,
): GmailTokenPayload => {
  const credentials = integration.account?.credentials;
  if (!credentials) {
    throw new Error("Missing Gmail credentials for integration");
  }
  return {
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    expiry_date: credentials.expiresAt,
    token_type: credentials.tokenType,
    scope: credentials.scope,
  };
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
    const server = providedIntegrations.length > 0
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
