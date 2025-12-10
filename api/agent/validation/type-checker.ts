import { logger } from "better-auth";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ValidationError } from "./types.ts";

const getPaths = () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const apiRoot = resolve(currentDir, "../..");
  const workspaceRoot = resolve(apiRoot, "..");

  return {
    apiRoot,
    integrationTypesPath: resolve(workspaceRoot, "packages/integration-types/mod.ts"),
    nodeModulesPath: resolve(workspaceRoot, "node_modules"),
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
      // Manually map @modelcontextprotocol/sdk to the node_modules location if needed,
      // but NodeNext resolution should find it if it's in node_modules.
      // We might need to help it find packages in the root node_modules if we are deeper.
      "json-schema-to-ts": [resolve(nodeModulesPath, "json-schema-to-ts/lib/types/index.d.ts")],
      "ts-algebra": [
        resolve(nodeModulesPath, ".deno/ts-algebra@2.0.0/node_modules/ts-algebra/lib/index.d.ts"),
      ],
      "*": ["*", resolve(nodeModulesPath, "*")],
    },
  };

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
    logger.warn("DIAGNOSTIC", {
      category: diagnostic.category,
      code: diagnostic.code,
      message: diagnostic.messageText,
      file: diagnostic.file?.fileName,
    });
    // if (
    //   diagnostic.category !== ts.DiagnosticCategory.Error &&
    //   diagnostic.category !== ts.DiagnosticCategory.Warning
    // ) {
    //   continue;
    // }

    // // Filter out errors that are not about the file we are checking
    // // (sometimes global or lib errors might slip through)
    // if (diagnostic.file && diagnostic.file.fileName !== filename) {
    //   continue;
    // }

    const messageText = diagnostic.messageText;
    const message = typeof messageText === "string" ? messageText : messageText.messageText;

    errors.push({
      rule: "typescript-typecheck",
      message,
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
