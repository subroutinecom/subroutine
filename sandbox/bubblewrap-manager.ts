export interface CommandExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

export interface BubblewrapOptions {
  timeout?: number;
  workingDir?: string;
  env?: Record<string, string>;
  filesystem?: Record<string, string>; // Map of file paths to contents
}

export class BubblewrapManager {
  private readonly defaultTimeout: number;
  private readonly tempDir: string;

  constructor(timeout: number = 5000, tempDir: string = "/tmp/sandbox") {
    this.defaultTimeout = timeout;
    this.tempDir = tempDir;
  }

  async executeCommand(
    command: string,
    args: string[] = [],
    options: BubblewrapOptions = {},
  ): Promise<CommandExecutionResult> {
    const timeout = options.timeout || this.defaultTimeout;
    const workingDir = options.workingDir || "/workspace";

    try {
      // Create a temporary directory for this execution
      const executionId = crypto.randomUUID();
      const executionDir = `${this.tempDir}/${executionId}`;

      await Deno.mkdir(executionDir, { recursive: true });

      // Materialize the filesystem if provided
      if (options.filesystem) {
        for (const [filePath, content] of Object.entries(options.filesystem)) {
          const fullPath = `${executionDir}${filePath}`;
          const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

          if (dirPath !== executionDir) {
            await Deno.mkdir(dirPath, { recursive: true });
          }

          await Deno.writeTextFile(fullPath, content);
        }
      }

      // Build bubblewrap command
      // Minimal configuration for Docker compatibility
      // We keep it simple to avoid pivot_root issues
      const bwrapArgs = [
        // Bind the entire root - this prevents pivot_root from being attempted
        "--dev-bind", "/", "/",

        // Bind our workspace
        "--bind", executionDir, workingDir,
        "--chdir", workingDir,

        // Basic isolation - keep it minimal
        "--unshare-pid",
        "--die-with-parent",

        // The actual command
        command,
        ...args,
      ];

      // Set up environment variables
      const env: Record<string, string> = {
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        HOME: workingDir,
        ...options.env,
      };

      const commandObj = new Deno.Command("bwrap", {
        args: bwrapArgs,
        env,
        stdout: "piped",
        stderr: "piped",
      });

      // Execute with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const process = commandObj.spawn();
        const { code, stdout, stderr } = await process.output();

        clearTimeout(timeoutId);

        const stdoutText = new TextDecoder().decode(stdout);
        const stderrText = new TextDecoder().decode(stderr);

        // Clean up
        try {
          await Deno.remove(executionDir, { recursive: true });
        } catch {
          // Ignore cleanup errors
        }

        return {
          success: code === 0,
          stdout: stdoutText,
          stderr: stderrText,
          exitCode: code,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        // Clean up
        try {
          await Deno.remove(executionDir, { recursive: true });
        } catch {
          // Ignore cleanup errors
        }

        if (error instanceof Error && error.name === "AbortError") {
          return {
            success: false,
            error: `Command execution timed out after ${timeout}ms`,
          };
        }
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
