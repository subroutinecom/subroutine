import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "logger-arg-pattern",
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that logger calls follow the (msg: string, meta?: any) pattern.",
    },
    messages: {
      invalidFirstArg: "The first argument to logger methods must be a string message. Found {{type}}.",
      tooManyArgs: "Logger methods accept at most 2 arguments (message, meta). Found {{count}}.",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "logger"
        ) {
          // Check argument count
          if (node.arguments.length > 2) {
             context.report({
              node: node,
              messageId: "tooManyArgs",
              data: {
                count: node.arguments.length,
              },
            });
          }

          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if first argument is NOT a string-like type
            // We allow:
            // - Literal (string)
            // - TemplateLiteral
            // - Identifier (we assume it's a string, unless we have type info, but we can't be sure so we let it pass to avoid false positives)
            // - CallExpression (e.g. JSON.stringify(...)) -> let it pass
            //
            // We explicitly disallow:
            // - ObjectExpression (e.g. { ... })
            // - Literal (number, boolean, null)
            // - ArrayExpression

            if (firstArg.type === "ObjectExpression") {
              context.report({
                node: firstArg,
                messageId: "invalidFirstArg",
                data: {
                  type: "Object",
                },
              });
            } else if (firstArg.type === "ArrayExpression") {
              context.report({
                node: firstArg,
                messageId: "invalidFirstArg",
                data: {
                  type: "Array",
                },
              });
            } else if (firstArg.type === "Literal") {
              if (typeof firstArg.value !== "string") {
                context.report({
                  node: firstArg,
                  messageId: "invalidFirstArg",
                  data: {
                    type: typeof firstArg.value, // e.g. "number", "boolean"
                  },
                });
              }
            }
          }
        }
      },
    };
  },
});

export default rule;
