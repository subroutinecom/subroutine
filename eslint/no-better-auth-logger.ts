import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-better-auth-logger",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing 'logger' from 'better-auth'. Use 'getLogger' from 'utils/logger.ts' instead.",
    },
    messages: {
      noBetterAuthLogger: "Do not import 'logger' from 'better-auth'. Use 'getLogger' from 'utils/logger.ts' instead.",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "better-auth") {
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "logger"
            ) {
              context.report({
                node: specifier,
                messageId: "noBetterAuthLogger",
              });
            }
          });
        }
      },
    };
  },
});

export default rule;
