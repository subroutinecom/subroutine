import express, { Request, Response } from "express";
import { SandboxManager } from "./sandbox-manager.ts";

const app = express();
const port = 3000;

app.use(express.json());

const sandboxManager = new SandboxManager();

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
