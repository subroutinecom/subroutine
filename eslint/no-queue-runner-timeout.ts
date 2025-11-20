import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-queue-runner-timeout",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow specifying timeout in QueueRunner calls (define timeouts in the queue type instead)",
    },
    messages: {
      noQueueRunnerTimeout: "Specify timeouts in the queue type instead of in QueueRunner calls.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      // look for calls to QueueRunner.<Queue>.<Event>({}, { timeout: ... })
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "MemberExpression" &&
          node.callee.object.object.type === "Identifier" &&
          node.callee.object.object.name === "QueueRunner"
        ) {
          const args = node.arguments;
          if (args.length < 2) return;

          const optionsArg = args[1];
          if (optionsArg.type === "ObjectExpression") {
            for (const prop of optionsArg.properties) {
              if (
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                prop.key.name === "timeout"
              ) {
                context.report({
                  node: optionsArg,
                  messageId: "noQueueRunnerTimeout",
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
