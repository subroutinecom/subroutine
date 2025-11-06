/// <reference lib="deno.worker" />

import { ExecuteMessage } from "./sandbox-manager.ts";

self.onmessage = async (event: MessageEvent<ExecuteMessage>) => {
  const { type, code, id } = event.data;

  if (type === "execute") {
    try {
      // Use dynamic import with data URL - Deno will transpile TypeScript automatically
      const moduleUrl = `data:application/typescript;base64,${btoa(code)}`;
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
