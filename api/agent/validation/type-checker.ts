import { Project, ts } from "ts-morph";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidationError } from "./types";

let typeCheckProject: Project | null = null;

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

const getProject = (): Project => {
  if (!typeCheckProject) {
    const { apiRoot, integrationTypesPath, nodeModulesPath } = getPaths();

    typeCheckProject = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        baseUrl: apiRoot,
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
