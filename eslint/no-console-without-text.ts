import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-console-without-text",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow use of console messages without descriptive text.",
    },
    messages: {
      noConsoleWithoutText: "console messages must include a descriptive text.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "console" &&
          node.callee.property.type === "Identifier" &&
          ["log", "warn", "error", "info", "debug"].indexOf(node.callee.property.name) !== -1
        ) {
          const args = node.arguments;
          if (args.length === 0) {
            context.report({
              node,
              messageId: "noConsoleWithoutText",
            });
            return;
          }
          const hasDescriptiveText = args.some((arg) => {
            return (
              (arg.type === "Literal" &&
                typeof arg.value === "string" &&
                arg.value.trim().length > 0) ||
              (arg.type === "TemplateLiteral" &&
                arg.quasis.some((q) => q.value.raw.trim().length > 0))
            );
          });
          if (!hasDescriptiveText) {
            context.report({
              node,
              messageId: "noConsoleWithoutText",
            });
          }
        }
      },
    };
  },
});

export default rule;
