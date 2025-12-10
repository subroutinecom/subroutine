import type { Rule } from "eslint";

export const mustDefineOutputsType: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure Outputs type/interface/class is defined",
    },
    schema: [],
  },
  create(context) {
    let outputsDefined = false;

    return {
      TSInterfaceDeclaration(node) {
        if (node.id.name === "Outputs") {
          outputsDefined = true;
        }
      },
      TSTypeAliasDeclaration(node) {
        if (node.id.name === "Outputs") {
          outputsDefined = true;
        }
      },
      ClassDeclaration(node) {
        if (node.id?.name === "Outputs") {
          outputsDefined = true;
        }
      },
      "Program:exit"(node) {
        if (!outputsDefined) {
          context.report({
            node,
            message:
              "Code must define an Outputs type (type Outputs = {...}, interface Outputs {...}, class Outputs {...}, or type Outputs = z.infer<...>)",
          });
        }
      },
    };
  },
};
