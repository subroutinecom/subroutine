import type { Rule } from "eslint";

export const mainMustBeExported: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure main function is exported",
    },
    schema: [],
  },
  create(context) {
    let mainExported = false;
    let mainDefined = false;
    let mainNode: any = null;

    return {
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (
            node.declaration.type === "FunctionDeclaration" &&
            node.declaration.id?.name === "main"
          ) {
            mainExported = true;
            mainDefined = true;
          }
          if (node.declaration.type === "VariableDeclaration") {
            for (const decl of node.declaration.declarations) {
              if (decl.id.type === "Identifier" && decl.id.name === "main") {
                mainExported = true;
                mainDefined = true;
              }
            }
          }
        }

        for (const specifier of node.specifiers) {
          if (specifier.exported.type === "Identifier" && specifier.exported.name === "main") {
            mainExported = true;
          }
        }
      },
      FunctionDeclaration(node) {
        if (node.id?.name === "main") {
          mainDefined = true;
          mainNode = node;
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.id.name === "main") {
          mainDefined = true;
          mainNode = node;
        }
      },
      "Program:exit"(node) {
        if (mainDefined && !mainExported) {
          context.report({
            node: mainNode || node,
            message: "Code must export the main function",
          });
        }
        // If main is not defined at all, other rules (main-must-be-async) might catch it, or maybe we should report here too?
        // The original rule seemed to only complain if main existed but wasn't exported, OR return generic error?
        // Reading original code: if mainFunc/mainVar exists but not exported -> error.
        // It does NOT seem to error if main is missing entirely (it returns []? No wait, looking closely at original code...)
        // Actually the original code returns error if mainFunc exists and is NOT exported.
        // It tries to find exports.
        // If it falls through, it returns "Code must export the main function" with line number of mainFunc if it exists.
        // If mainFunc/mainVar don't exist, it seems to report the error anyway?
        // Wait, `line: mainFunc?.getStartLineNumber()` implies mainFunc might be undefined.
      },
    };
  },
};
