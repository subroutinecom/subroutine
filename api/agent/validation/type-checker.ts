import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { getLogger } from "../../utils/logger.ts";
import type { ValidationError } from "./types.ts";
const logger = getLogger("api/agent/validation/type-checker.ts");

const getPaths = () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const apiRoot = resolve(currentDir, "../..");
  const workspaceRoot = resolve(apiRoot, "..");

  return {
    apiRoot,
    integrationTypesPath: resolve(workspaceRoot, "packages/integration-types/mod.ts"),
    nodeModulesPath: resolve(apiRoot, "node_modules"),
  };
};

export interface TypeCheckResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Run TypeScript type checking on code.
 * Code should include proper import statements - no preamble is added.
 * Example: import type { Integrations } from "@subroutine/integration-types";
 */
export const typeCheckCode = (code: string): TypeCheckResult => {
  const { apiRoot, integrationTypesPath, nodeModulesPath } = getPaths();
  // Virtual filename in the same directory to ensure relative imports would resolve similarly if present
  const filename = resolve(dirname(fileURLToPath(import.meta.url)), `_check_${Date.now()}.ts`);

  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    baseUrl: apiRoot,
    paths: {
      "@subroutine/integration-types": [integrationTypesPath],
      // googleapis: [resolve(nodeModulesPath, "googleapis")],
      "@modelcontextprotocol/sdk/client": [
        resolve(nodeModulesPath, "@modelcontextprotocol/sdk/dist/esm/client/index.d.ts"),
      ],
      "@modelcontextprotocol/sdk/*": [
        resolve(nodeModulesPath, "@modelcontextprotocol/sdk/dist/esm/*"),
      ],
      "*": ["*", resolve(nodeModulesPath, "*")],
    },
  };

  logger.warn("Type checking with options:", compilerOptions);

  // Create a compiler host that serves our virtual file from memory
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile;

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === filename) {
      return ts.createSourceFile(fileName, code, languageVersion);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([filename], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors: ValidationError[] = [];

  for (const diagnostic of diagnostics) {
    const messageText = diagnostic.messageText;
    const message = typeof messageText === "string" ? messageText : messageText.messageText;

    errors.push({
      rule: "typescript-typecheck",
      message,
      file: diagnostic.file?.fileName === filename ? "<your source>" : "<external file>",
      line: diagnostic.file
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!).line + 1
        : 0,
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 10), // Limit to 10 errors
  };
};

/**
 * Reset the cached project (useful for testing).
 * In this implementation we create a fresh program each time so this is a no-op but kept for API compat.
 */
export const resetTypeCheckProject = (): void => {
  // no-op
};
