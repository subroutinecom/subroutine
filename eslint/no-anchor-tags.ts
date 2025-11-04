import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-anchor-tags",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow use of <a> tags; use <Link> instead.",
    },
    messages: {
      noAnchor: "Use <Link> instead of <a> for internal navigation.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "a") {
          context.report({
            node,
            messageId: "noAnchor",
          });
        }
      },
    };
  },
});

export default rule;
