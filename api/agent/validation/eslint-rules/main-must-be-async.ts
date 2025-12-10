import type { Rule } from "eslint";

export const mainMustBeAsync: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure main function is async",
    },
    schema: [],
  },
  create(context) {
    let mainFound = false;

    return {
      FunctionDeclaration(node) {
        if (node.id?.name === "main") {
          mainFound = true;
          if (!node.async) {
            context.report({
              node,
              message: "The main function must be async",
            });
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.id.name === "main") {
          mainFound = true;
          if (
            node.init &&
            (node.init.type === "ArrowFunctionExpression" ||
              node.init.type === "FunctionExpression")
          ) {
            if (!node.init.async) {
              context.report({
                node,
                message: "The main function must be async",
              });
            }
          }
        }
      },
      "Program:exit"(node) {
        if (!mainFound) {
          context.report({
            node,
            message: "Code must define an async function named 'main'",
          });
        }
      },
    };
  },
};
