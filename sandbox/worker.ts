/// <reference lib="deno.worker" />

import { createMessagePortClient, type Remote } from "./remoteProxy";
import type { Integrations } from "@subroutine/integration-types";

// Store the integrations client (it's a Remote proxy)
let integrations: Remote<Integrations> | undefined = undefined;
let latestMarkerHash: string | undefined = undefined;
let currentRunId: string | undefined = undefined;

// Define global pmarker function for code tracing
// deno-lint-ignore no-explicit-any
(globalThis as any).pmarker = (hash: string) => {
  latestMarkerHash = hash;
  // Used for code execution tracing/hashing
  // console.log(`[pmarker] ${hash}`);
};

// Additional message types for worker communication
interface ConnectMessage {
  type: "connect";
}

export interface ExecuteMessage {
  type: "execute";
  code: string;
  id: string;
  runId?: string;
  contentType?: string;
  inputs?: Record<string, unknown>;
}

type WorkerMessage = ExecuteMessage | ConnectMessage;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  // Handle MessagePort connection
  if (type === "connect") {
    const ports = (event as MessageEvent).ports;
    if (ports && ports.length > 0) {
      const port = ports[0];

      // Create integration proxy client using the MessagePort
      const client = createMessagePortClient<Integrations>(port, () => ({
        runId: currentRunId,
        latestMarkerId: latestMarkerHash,
      }));
      integrations = client.getProxy<Integrations>();

      // Expose integrations globally so user code can access them
      (globalThis as { integrations?: Remote<Integrations> }).integrations = integrations;

      // Signal that we're ready
      self.postMessage({ type: "execution_ready" });
    }
    return;
  }

  if (type === "execute") {
    const {
      code,
      id,
      runId,
      contentType = "application/typescript",
      inputs = {},
    } = event.data as ExecuteMessage;

    currentRunId = runId;

    try {
      // Use dynamic import with data URL - Deno will transpile TypeScript automatically
      const moduleUrl = `data:${contentType};base64,${btoa(code)}`;
      const module = await import(moduleUrl);

      let result;
      // Prefer 'main' export, fall back to default
      const entryPoint = module.main || module.default;

      if (typeof entryPoint === "function") {
        const options = {
          integrations,
          pmarker: (globalThis as any).pmarker,
        };
        // Pass inputs and options object
        result = await entryPoint(inputs, options);
      } else {
        result = entryPoint;
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
