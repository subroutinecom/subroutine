import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp-server";
import {
  generateSubroutine,
  getSubroutine,
  listSubroutines,
  runSubroutine,
  getRun,
  listRuns,
} from "./subroutine-service";

const app = express();
const PORT = 3003;

app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/subroutines", async (req, res) => {
  try {
    const { request } = req.body;

    if (!request || typeof request !== "string") {
      res.status(400).json({
        error: {
          code: "VALIDATION",
          message: "request field is required and must be a string",
        },
      });
      return;
    }

    const subroutine = await generateSubroutine({
      request,
    });

    res.status(201).json({
      subroutineUri: `resource://subroutines/${subroutine.id}`,
      subroutine,
    });
  } catch (_error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to generate subroutine",
      },
    });
  }
});

app.get("/api/subroutines", (_req, res) => {
  const subroutines = listSubroutines();
  res.json({ subroutines });
});

// Get a specific subroutine
app.get("/api/subroutines/:id", (req, res) => {
  const subroutine = getSubroutine(req.params.id);

  if (!subroutine) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "subroutine not found",
      },
    });
    return;
  }

  res.json({ subroutine });
});

app.post("/api/subroutines/:id/run", (req, res) => {
  try {
    const { inputs, timeoutMs } = req.body;

    const run = runSubroutine({
      subroutineId: req.params.id,
      inputs,
      timeoutMs,
    });

    res.status(201).json({
      runUri: `resource://runs/${run.id}`,
      run,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Subroutine not found") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "subroutine not found",
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to run subroutine",
      },
    });
  }
});

app.get("/api/runs", (_req, res) => {
  const runs = listRuns();
  res.json({ runs });
});

app.get("/api/runs/:id", (req, res) => {
  const run = getRun(req.params.id);

  if (!run) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "run not found",
      },
    });
    return;
  }

  res.json({ run });
});

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    console.log(`Received MCP request for session: ${sessionId}`);
  } else {
    console.log("New MCP request");
  }

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.log(`Session initialized with ID: ${newSessionId}`);
          transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(
            `Transport closed for session ${sid}, removing from transports map`,
          );
          delete transports[sid];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`Establishing SSE stream for session ${sessionId}`);
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling session termination:", error);
    if (!res.headersSent) {
      res.status(500).send("Error processing session termination");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
});
