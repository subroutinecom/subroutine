import type { Rule } from "eslint";

// Helper to check for return statement, skipping nested functions
const hasReturnStatement = (node: any): boolean => {
  if (node.type === "ReturnStatement") {
    return true;
  }

  // Do not traverse into nested functions
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return false;
  }

  // Recursively check properties
  for (const key in node) {
    if (key === "parent") continue;
    const prop = node[key];
    if (Array.isArray(prop)) {
      for (const child of prop) {
        if (child && typeof child.type === "string") {
          if (hasReturnStatement(child)) return true;
        }
      }
    } else if (prop && typeof prop.type === "string") {
      // Wait, we need to be careful. if we are AT a FunctionDeclaration, we shouldn't recurse into its body.
      // But traverse calls on the node itself.
      // My logic above: if node.type is Function, return false.
      // This means if I call hasReturnStatement(someFunctionNode), it returns false immediately!
      // This is wrong for the STARTING node (the main function).
      // The recursive calls should check the type BEFORE recursing.
      if (hasReturnStatement(prop)) return true;
    }
  }
  return false;
};

const bodyHasReturn = (node: any): boolean => {
  // If block statement
  if (node.type === "BlockStatement") {
    for (const statement of node.body) {
      if (checkForReturnRecursively(statement)) return true;
    }
    return false;
  }
  // If expression (arrow function implicit return)
  return true;
};

const checkForReturnRecursively = (node: any): boolean => {
  if (!node) return false;
  if (node.type === "ReturnStatement") return true;

  // Stop at function boundaries
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return false;
  }

  // Check known potential children with statements
  const childrenToCheck: any[] = [];

  if (node.body) {
    if (Array.isArray(node.body)) childrenToCheck.push(...node.body);
    else childrenToCheck.push(node.body);
  }
  if (node.consequent) childrenToCheck.push(node.consequent);
  if (node.alternate) childrenToCheck.push(node.alternate);
  if (node.cases) childrenToCheck.push(...node.cases); // SwitchStatement
  if (node.block) childrenToCheck.push(node.block); // TryStatement
  if (node.handler) childrenToCheck.push(node.handler); // CatchClause
  if (node.finalizer) childrenToCheck.push(node.finalizer);

  for (const child of childrenToCheck) {
    if (checkForReturnRecursively(child)) return true;
  }

  return false;
};

export const mainMustReturnOutputs: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure main function returns outputs",
    },
    schema: [],
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.id?.name === "main") {
          if (!bodyHasReturn(node.body)) {
            context.report({
              node,
              message: "The main function must have a return statement",
            });
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.id.name === "main") {
          if (
            node.init &&
            (node.init.type === "ArrowFunctionExpression" ||
              node.init.type === "FunctionExpression")
          ) {
            if (!bodyHasReturn(node.init.body)) {
              context.report({
                node,
                message: "The main function must have a return statement",
              });
            }
          }
        }
      },
    };
  },
};
