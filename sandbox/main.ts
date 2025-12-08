import { Hono } from "hono";
import process from "node:process";
import { BubblewrapManager } from "./bubblewrap-manager.ts";
import { SandboxManager } from "./sandbox-manager.ts";

const app = new Hono();
const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

const sandboxManager = new SandboxManager();
const bubblewrapManager = new BubblewrapManager();

app.get("/_status", (c) => {
  return c.json({ status: "live" });
});

app.post("/test/executeTypescript", async (c) => {
  const requestStart = Date.now();
  try {
    const body = await c.req.json();
    const { code, integrations, timeoutMs, inputs, runId } = body;

    console.log(
      `[Sandbox] Received executeTypescript request, timeoutMs: ${timeoutMs ?? "default"}`
    );

    if (!code || typeof code !== "string") {
      return c.json(
        {
          success: false,
          error: "Missing or invalid 'code' field in request body",
        },
        400
      );
    }

    const result = await sandboxManager.executeCode(code, {
      integrations: Array.isArray(integrations) ? integrations : undefined,
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
      inputs: typeof inputs === "object" ? inputs : undefined,
      runId: typeof runId === "string" ? runId : undefined,
    });

    const elapsed = Date.now() - requestStart;
    console.log(
      `[Sandbox] executeTypescript completed in ${elapsed}ms, success: ${result.success}`
    );

    if (result.success) {
      return c.json(result);
    } else {
      console.log(`[Sandbox] Execution failed: ${result.error}`);
      console.log(`[Sandbox] Original source code:\n${code}`);
      return c.json(result, 400);
    }
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

app.post("/test/executeCommand", async (c) => {
  try {
    const body = await c.req.json();
    const { command, args, filesystem, env, timeout } = body;

    if (!command || typeof command !== "string") {
      return c.json(
        {
          success: false,
          error: "Missing or invalid 'command' field in request body",
        },
        400
      );
    }

    const result = await bubblewrapManager.executeCommand(command, args || [], {
      filesystem,
      env,
      timeout,
    });

    if (result.success) {
      return c.json(result);
    } else {
      return c.json(result, 400);
    }
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

Deno.serve({ port: PORT }, app.fetch);

console.log(`Server running on port ${PORT}`);
