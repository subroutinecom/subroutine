/// <reference lib="deno.worker" />

import { ExecuteMessage, ResultMessage } from "./sandbox-manager.ts";

self.onmessage = async (event: MessageEvent<ExecuteMessage>) => {
  const { type, code, id } = event.data;

  if (type === "execute") {
    try {
      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
      ).constructor;
      const fn = new AsyncFunction(code);
      const result = await fn();

      self.postMessage({
        type: "result",
        id,
        data: result,
      } as ResultMessage);
    } catch (error) {
      self.postMessage({
        type: "error",
        id,
        error: error instanceof Error ? error.message : String(error),
      } as ResultMessage);
    }
  }
};
