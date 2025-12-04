import { ESLintUtils } from "@typescript-eslint/utils";
import * as path from "node:path";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-console",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow use of console methods in favor of the structured logger.",
    },
    messages: {
      noConsole: "Use getLogger('module').{{method}}() instead of console.{{method}}().",
    },
    schema: [],
    fixable: "code",
  },
  defaultOptions: [],

  create(context) {
    let hasLogger = false;
    let hasImport = false;
    let lastImportNode: any = null;
    let firstConsoleNode: any = null;

    return {
      Program(node) {
        for (const statement of node.body) {
          if (statement.type === "ImportDeclaration") {
            lastImportNode = statement;
            if (statement.source.value.includes("utils/logger")) {
              hasImport = true;
            }
          }
          if (statement.type === "VariableDeclaration") {
            for (const decl of statement.declarations) {
              if (decl.id.type === "Identifier" && decl.id.name === "logger") {
                hasLogger = true;
              }
            }
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "console" &&
          node.callee.property.type === "Identifier" &&
          ["log", "warn", "error", "info", "debug"].includes(node.callee.property.name)
        ) {
          if (!firstConsoleNode) {
            firstConsoleNode = node;
          }

          context.report({
            node,
            messageId: "noConsole",
            data: {
              method: node.callee.property.name,
            },
            fix(fixer) {
              const replacements = [];
              const memberExp = node.callee as any;
              const method = memberExp.property.name === "log" ? "info" : memberExp.property.name;
              
              replacements.push(fixer.replaceText(node.callee, `logger.${method}`));

              // Only add import/logger definition if we haven't found one AND this is the first error we are fixing
              if (!hasLogger && node === firstConsoleNode) {
                const filename = context.filename || "unknown.ts";
                // Attempt to find api/ root. Assume we run eslint from api/ or root/
                // If cwd contains 'api', we can assume logger is at api/utils/logger.ts
                // If not, maybe we are in root.
                
                // Simple heuristic: try to construct path relative to file location
                // We know the structure is api/utils/logger.ts
                
                // Find the 'api' segment in the path
                const parts = filename.split(path.sep);
                const apiIndex = parts.lastIndexOf("api");
                
                let loggerPath = "";
                let moduleName = "unknown";

                if (apiIndex !== -1) {
                   const apiRoot = parts.slice(0, apiIndex + 1).join(path.sep);
                   const absoluteLoggerPath = path.join(apiRoot, "utils", "logger.ts");
                   const dir = path.dirname(filename);
                   let relativePath = path.relative(dir, absoluteLoggerPath);
                   
                   if (!relativePath.startsWith(".")) {
                       relativePath = "./" + relativePath;
                   }
                   // Deno/TS needs extension? In this codebase yes.
                   loggerPath = relativePath;

                   // Module name: foo.bar from api/foo/bar.ts
                   const relativeToApi = parts.slice(apiIndex + 1).join(".");
                   moduleName = relativeToApi.replace(/\.ts$/, "").replace(/\.tsx$/, "");
                } else {
                    // Fallback if not in expected structure
                    loggerPath = "../utils/logger.ts";
                    moduleName = path.basename(filename).replace(/\.ts$/, "");
                }

                let insertText = "";
                if (!hasImport) {
                  insertText += `import { getLogger } from "${loggerPath}";\n`;
                }
                insertText += `const logger = getLogger("${moduleName}");\n`;
                if (hasImport) insertText += "\n"; // Add spacing if we just added logger var

                if (lastImportNode) {
                  replacements.push(fixer.insertTextAfter(lastImportNode, "\n" + insertText));
                } else {
                  const firstNode = context.sourceCode.ast.body[0];
                  if (firstNode) {
                      replacements.push(fixer.insertTextBefore(firstNode, insertText + "\n"));
                  } else {
                      replacements.push(fixer.insertTextAfterRange([0, 0], insertText));
                  }
                }
                
                // Mark as handled for this pass so we don't add it again if multiple fixes run
                hasLogger = true; 
              }

              return replacements;
            },
          });
        }
      },
    };
  },
});

export default rule;
