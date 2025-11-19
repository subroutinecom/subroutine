import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-window-session-or-local-storage",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calls to window.sessionStorage or window.localStorage",
    },
    messages: {
      noWindowStorage: "window.sessionStorage and window.localStorage are not allowed.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "MemberExpression" &&
          node.object.object.type === "Identifier" &&
          node.object.object.name === "window" &&
          node.object.property.type === "Identifier" &&
          (node.object.property.name === "sessionStorage" ||
            node.object.property.name === "localStorage")
        ) {
          context.report({
            node,
            messageId: "noWindowStorage",
          });
        }
      },
    };
  },
});

export default rule;
