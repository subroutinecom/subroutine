import type { Rule } from "eslint";

export const mustDefineInputsType: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure Inputs type/interface/class is defined",
    },
    schema: [],
  },
  create(context) {
    let inputsDefined = false;

    return {
      TSInterfaceDeclaration(node: any) {
        if (node.id.name === "Inputs") {
          inputsDefined = true;
        }
      },
      TSTypeAliasDeclaration(node: any) {
        if (node.id.name === "Inputs") {
          inputsDefined = true;
        }
      },
      ClassDeclaration(node: any) {
        if (node.id?.name === "Inputs") {
          inputsDefined = true;
        }
      },
      "Program:exit"(node) {
        if (!inputsDefined) {
          context.report({
            node,
            message:
              "Code must define an Inputs type (type Inputs = {...}, interface Inputs {...}, class Inputs {...}, or type Inputs = z.infer<...>)",
          });
        }
      },
    };
  },
};
