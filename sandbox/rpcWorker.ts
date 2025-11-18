/// <reference lib="deno.worker" />

import {
  RemoteProxyServer,
  type CallRequest,
  type CallResponse,
} from "./remoteProxy";

// Integration API interfaces
interface GmailLabelsAPI {
  list(input: { userId: string }): Promise<{ labels: string[] }>;
}

interface GmailAPI {
  labels: GmailLabelsAPI;
}

interface S3API {
  listBuckets(): Promise<{ buckets: string[] }>;
}

interface GithubAPI {
  me(): Promise<{ login: string }>;
}

interface PingAPI {
  ping(message: string): Promise<{ echo: string; timestamp: number }>;
}

// Create the RPC server
const server = new RemoteProxyServer<object>();

// Register Gmail integration (singleton)
server.registerSingleton("getGmail", async () => {
  const labelsByUser: Record<string, string[]> = { me: ["INBOX", "STARRED"] };
  const gmail: GmailAPI = {
    labels: {
      list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }),
    },
  };
  return gmail as unknown as object;
});

// Register S3 integration (singleton)
server.registerSingleton("getS3", async () => {
  const s3: S3API = {
    listBuckets: async () => ({ buckets: ["photos", "backups"] }),
  };
  return s3 as unknown as object;
});

// Register Github integration (singleton)
server.registerSingleton("getGithub", async () => {
  const gh: GithubAPI = {
    me: async () => ({ login: "octocat" }),
  };
  return gh as unknown as object;
});

// Register Ping integration (for testing plumbing)
server.registerSingleton("getPing", async () => {
  const ping: PingAPI = {
    ping: async (message: string) => ({
      echo: message,
      timestamp: Date.now(),
    }),
  };
  return ping as unknown as object;
});

type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | { kind: "rpc_result"; payload: CallResponse };

// Store the MessagePort when we receive it
let messagePort: MessagePort | null = null;

// Listen for the MessagePort from the parent
addEventListener("message", (ev: Event) => {
  const msg = (ev as MessageEvent).data;

  // Handle port connection from parent
  if (msg && msg.type === "connect") {
    const ports = (ev as MessageEvent).ports;
    if (ports && ports.length > 0) {
      messagePort = ports[0];

      // Set up message handling on the port
      messagePort.onmessage = async (portEvent: MessageEvent<WireMessage>) => {
        const wireMsg = portEvent.data;
        if (!wireMsg || wireMsg.kind !== "rpc") return;

        const req = wireMsg.payload;
        // Enforce JSON boundary
        const res = await server.handle(
          JSON.parse(JSON.stringify(req)) as CallRequest,
        );
        const wire: WireMessage = {
          kind: "rpc_result",
          payload: JSON.parse(JSON.stringify(res)) as CallResponse,
        };
        messagePort!.postMessage(wire);
      };

      // Send acknowledgment back to parent
      (self as unknown as { postMessage: (data: unknown) => void }).postMessage(
        {
          type: "rpc_ready",
        },
      );
    }
  }
});
