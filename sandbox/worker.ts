/// <reference lib="deno.worker" />

import { ExecuteMessage } from "./sandbox-manager.ts";

self.onmessage = async (event: MessageEvent<ExecuteMessage>) => {
  const { type, code, id } = event.data;

  if (type === "execute") {
    try {
      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
      ).constructor as new (code: string) => () => Promise<unknown>;
      const fn = new AsyncFunction(code);
      const result = await fn();

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
