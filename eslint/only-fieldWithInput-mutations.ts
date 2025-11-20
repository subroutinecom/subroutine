import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "only-fieldWithInput-mutations",
  meta: {
    type: "problem",
    docs: {
      description: "Inside of memoizeMutationField, use t.fieldWithInput instead of t.field.",
    },
    messages: {
      noTField: "Use t.fieldWithInput instead of t.field for mutations with input.",
      noArgs: "Mutations should use 'input' instead of 'args'.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      // find t.field({args: {})) inside of memoizeMutationField
      // start by finding the args arg and then traverse parents
      CallExpression(node) {
        if (
          !(
            node.callee.type === "MemberExpression" &&
            node.callee.property.type === "Identifier" &&
            node.callee.property.name === "field"
          )
        ) {
          return;
        }

        // traverse parents until we find a CallExpression that is memoizeMutationField
        let current: TSESTree.Node | undefined = node.parent;
        let foundMemoize = false;
        let foundTFieldWithInput = false;
        while (current) {
          if (
            current.type === "CallExpression" &&
            current.callee.type === "Identifier" &&
            current.callee.name === "memoizeMutationField"
          ) {
            foundMemoize = true;
          }

          if (
            current.type === "CallExpression" &&
            current.callee.type === "MemberExpression" &&
            current.callee.property.type === "Identifier" &&
            current.callee.property.name === "fieldWithInput"
          ) {
            foundTFieldWithInput = true;

            // make sure the child is an object and has an input property and no args property
            if (current.arguments.length > 0 && current.arguments[0].type === "ObjectExpression") {
              const hasArgs = current.arguments[0].properties.some(
                (prop: TSESTree.Node) =>
                  prop.type === "Property" &&
                  prop.key.type === "Identifier" &&
                  prop.key.name === "args"
              );
              if (hasArgs) {
                context.report({
                  node,
                  messageId: "noArgs",
                });
              }
            }
          }
          current = current.parent;
        }
        if (!foundMemoize || foundTFieldWithInput) return;

        context.report({
          node,
          messageId: "noTField",
        });
      },
    };
  },
});

export default rule;
