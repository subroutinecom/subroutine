import { SourceFile, SyntaxKind, AwaitExpression, Node, FunctionDeclaration, FunctionExpression, ArrowFunction } from "ts-morph";
import { createHash } from "node:crypto";
import type { TransformFn } from "./types.ts";

export const pmarkerTransform: TransformFn = (sourceFile: SourceFile) => {
  const fullText = sourceFile.getFullText();
  const awaitExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.AwaitExpression);
  
  // Compute hashes based on original text first to preserve "source code stability" semantics
  const replacements: { node: AwaitExpression; hash: string }[] = [];

  for (const awaitExpr of awaitExpressions) {
    const startPos = awaitExpr.getStart();
    const codeBefore = fullText.substring(0, startPos);
    const hash = createHash("sha256").update(codeBefore).digest("hex").substring(0, 8);
    replacements.push({ node: awaitExpr, hash });
  }

  // Apply replacements
  // We wrap in parens and use comma operator to maintain expression semantics
  // pmarker returns void, so (pmarker(), await ...) evaluates to the result of await
  for (const { node, hash } of replacements) {
    if (node.wasForgotten()) continue;
    const originalText = node.getText();
    node.replaceWithText(`(pmarker('${hash}'), ${originalText})`);
  }

  // Ensure pmarker is destructured from the second argument of the main function
  const functionDecl = sourceFile.getFunctions().find(f => f.isDefaultExport());
  let mainFunction: FunctionDeclaration | FunctionExpression | ArrowFunction | undefined = functionDecl;
  
  if (!mainFunction) {
      const exportAssignment = sourceFile.getExportAssignments()[0];
      if (exportAssignment) {
          const expr = exportAssignment.getExpression();
          if (Node.isFunctionExpression(expr) || Node.isArrowFunction(expr)) {
             mainFunction = expr;
          }
      }
  }

  if (mainFunction) {
      const params = mainFunction.getParameters();
      if (params.length < 2) {
          // Add second parameter if missing
          mainFunction.addParameter({ name: "{ pmarker }" });
      } else {
          const secondParam = params[1];
          const nameNode = secondParam.getNameNode();
          
          if (Node.isObjectBindingPattern(nameNode)) {
             // Case: function(inputs, { integrations })
             if (!nameNode.getElements().some(e => e.getName() === "pmarker")) {
                 // Add pmarker to destructuring using text replacement since addElement/addBindingElement are not available
                 const text = nameNode.getText();
                 const elements = nameNode.getElements();
                 
                 if (elements.length === 0) {
                     nameNode.replaceWithText("{ pmarker }");
                 } else {
                     // Insert before the closing brace
                     const lastBraceIndex = text.lastIndexOf("}");
                     if (lastBraceIndex !== -1) {
                         const newText = text.substring(0, lastBraceIndex) + ", pmarker }";
                         nameNode.replaceWithText(newText);
                     }
                 }
             }
          } else if (Node.isIdentifier(nameNode)) {
              // Case: function(inputs, context)
              const body = mainFunction.getBody();
              if (Node.isBlock(body)) {
                  body.insertStatements(0, `const { pmarker } = ${nameNode.getText()};`);
              }
          }
      }
  }
};
