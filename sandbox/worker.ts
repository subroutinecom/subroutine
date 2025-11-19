/// <reference lib="deno.worker" />

import { createMessagePortClient, type Remote } from "./remoteProxy";
import type { GmailAPI } from "./integrations/gmail/types";

// Additional message types for worker communication
interface ConnectMessage {
  type: "connect";
}

export interface ExecuteMessage {
  type: "execute";
  code: string;
  id: string;
  contentType?: string;
}

type WorkerMessage = ExecuteMessage | ConnectMessage;

// Integration interfaces for type safety
interface S3API {
  listBuckets(): Promise<{ buckets: string[] }>;
}

interface GithubAPI {
  me(): Promise<{ login: string }>;
}

interface PingAPI {
  ping(message: string): Promise<{ echo: string; timestamp: number }>;
}

interface Integrations {
  getGmail(): Promise<GmailAPI>;
  getS3(): Promise<S3API>;
  getGithub(): Promise<GithubAPI>;
  getPing(): Promise<PingAPI>;
}

// Store the integrations client (it's a Remote proxy)
let integrations: Remote<Integrations> | undefined = undefined;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  // Handle MessagePort connection
  if (type === "connect") {
    const ports = (event as MessageEvent).ports;
    if (ports && ports.length > 0) {
      const port = ports[0];

      // Create integration proxy client using the MessagePort
      const client = createMessagePortClient<Integrations>(port);
      integrations = client.getProxy<Integrations>();

      // Expose integrations globally so user code can access them
      (globalThis as { integrations?: Remote<Integrations> }).integrations = integrations;

      // Signal that we're ready
      self.postMessage({ type: "execution_ready" });
    }
    return;
  }

  if (type === "execute") {
    const { code, id, contentType = "application/typescript" } = event.data as ExecuteMessage;
    try {
      // Use dynamic import with data URL - Deno will transpile TypeScript automatically
      const moduleUrl = `data:${contentType};base64,${btoa(code)}`;
      const module = await import(moduleUrl);

      let result;
      if (typeof module.default === "function") {
        result = await module.default();
      } else {
        result = module.default;
      }

      self.postMessage({
        type: "result",
        id,
        data: result,
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
