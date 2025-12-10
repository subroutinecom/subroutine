import type { Rule } from "eslint";

export const noCtxParam: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of 'ctx'",
    },
    schema: [],
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name !== "ctx") {
          return;
        }

        const parent = node.parent;
        if (!parent) return;

        // Check for property access: ctx.something
        if (parent.type === "MemberExpression" && parent.object === node) {
          context.report({
            node,
            message:
              "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
          });
          return;
        }

        // Check for parameter definition: function(ctx)
        if (
          // standard function param
          (parent.type === "FunctionDeclaration" ||
            parent.type === "FunctionExpression" ||
            parent.type === "ArrowFunctionExpression") &&
          parent.params.includes(node)
        ) {
          context.report({
            node,
            message:
              "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
          });
          return;
        }

        // Check if just defined as a parameter in a callback or something?
        // Wait, AST for params is usually Identifier inside the params array.
        // Yes, handled above.

        // Check for function call argument: someFunc(ctx)
        if (parent.type === "CallExpression" && parent.arguments.includes(node)) {
          context.report({
            node,
            message:
              "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
          });
          return;
        }
      },
    };
  },
};
