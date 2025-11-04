import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-graphql-fetch",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow string references to the /graphql endpoint",
    },
    messages: {
      noFetch: "Use the GraphQL client instead of fetch for GraphQL queries.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && node.value.endsWith("/graphql")) {
          // if this is an import, it's fine
          let hasImportParent = false;
          let current: any = node.parent;
          while (current) {
            if (current.type === "ImportDeclaration") {
              hasImportParent = true;
              break;
            }
            current = current.parent;
          }

          if (hasImportParent) return;
          context.report({
            node,
            messageId: "noFetch",
          });
        }
      },
    };
  },
});

export default rule;
