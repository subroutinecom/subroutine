import type { Rule } from "eslint";

export const noNestedImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure imports are at top level",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.parent.type !== "Program") {
          context.report({
            node,
            message:
              "Import statements must be at the top level of the file, not inside functions or blocks.",
          });
        }
      },
    };
  },
};
