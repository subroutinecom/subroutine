import { SourceFile, SyntaxKind, AwaitExpression } from "ts-morph";
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

  // Inject declaration so TypeScript doesn't complain about the global function
  sourceFile.insertStatements(0, "declare function pmarker(hash: string): void;");
};
