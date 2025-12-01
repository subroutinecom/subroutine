import { Project, ts } from "ts-morph";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { ValidationError } from "./types";

let typeCheckProject: Project | null = null;

const getProject = (): Project => {
  if (!typeCheckProject) {
    // In Docker (both dev and prod), packages are at /app/packages
    // Outside Docker, use path relative to this file
    const dockerPackagesPath = "/app/packages/integration-types/mod.ts";
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const localPackagesPath = resolve(currentDir, "../../../packages/integration-types/mod.ts");

    const integrationTypesPath = existsSync(dockerPackagesPath)
      ? dockerPackagesPath
      : localPackagesPath;

    // For baseUrl, use a path that exists
    const baseUrl = existsSync("/app/api") ? "/app/api" : resolve(currentDir, "../..");
    const nodeModulesPath = resolve(baseUrl, "node_modules");

    typeCheckProject = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        baseUrl,
        paths: {
          "@subroutine/integration-types": [integrationTypesPath],
          googleapis: [resolve(nodeModulesPath, "googleapis")],
          "@modelcontextprotocol/sdk/client": [
            resolve(nodeModulesPath, "@modelcontextprotocol/sdk/dist/esm/client/index.d.ts"),
          ],
          "@modelcontextprotocol/sdk/*": [
            resolve(nodeModulesPath, "@modelcontextprotocol/sdk/dist/esm/*"),
          ],
        },
      },
    });
  }
  return typeCheckProject;
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
  const project = getProject();

  const filename = `typecheck-${Date.now()}.ts`;
  const sourceFile = project.createSourceFile(filename, code, { overwrite: true });

  try {
    const diagnostics = sourceFile.getPreEmitDiagnostics();

    const errors: ValidationError[] = [];

    for (const diagnostic of diagnostics) {
      if (diagnostic.getCategory() !== ts.DiagnosticCategory.Error) {
        continue;
      }

      const messageText = diagnostic.getMessageText();
      const message = typeof messageText === "string" ? messageText : messageText.getMessageText();

      errors.push({
        rule: "typescript-typecheck",
        message,
        line: diagnostic.getLineNumber(),
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.slice(0, 10), // Limit to 10 errors
    };
  } finally {
    sourceFile.delete();
  }
};

/**
 * Reset the cached project (useful for testing).
 */
export const resetTypeCheckProject = (): void => {
  typeCheckProject = null;
};
