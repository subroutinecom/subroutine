import express, { Request, Response } from "express";
import process from "node:process";
import { BubblewrapManager } from "./bubblewrap-manager.ts";
import { SandboxManager } from "./sandbox-manager.ts";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

app.use(express.json());

const sandboxManager = new SandboxManager();
const bubblewrapManager = new BubblewrapManager();

app.get("/_status", (_req: Request, res: Response) => {
  res.json({ status: "live" });
});

app.post("/test/executeTypescript", async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid 'code' field in request body",
      });
      return;
    }

    const result = await sandboxManager.executeCode(code);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/test/executeCommand", async (req: Request, res: Response) => {
  try {
    const { command, args, filesystem, env, timeout } = req.body;

    if (!command || typeof command !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid 'command' field in request body",
      });
      return;
    }

    const result = await bubblewrapManager.executeCommand(command, args || [], {
      filesystem,
      env,
      timeout,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
