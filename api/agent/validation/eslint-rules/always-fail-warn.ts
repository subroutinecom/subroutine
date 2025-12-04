import { ESLintUtils } from "@typescript-eslint/utils";
import { getLogger } from "../../../utils/logger.ts";
const logger = getLogger("agent.validation.eslint-rules.always-fail-warn");


const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "always-fail-warn",
  meta: {
    type: "problem",
    docs: {
      description: "Always warns to test eslint integration.",
    },
    messages: {
      alwaysFail: "This is a test warning from always-fail-warn rule.",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    logger.info("DEBUG: always-fail-warn rule executing");
    return {
      Program(node) {
        context.report({
          node,
          messageId: "alwaysFail",
        });
      },
    };
  },
});

export default rule;
