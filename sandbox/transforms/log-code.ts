import { SourceFile } from "ts-morph";
import type { TransformFn } from "./types.ts";

export const logCodeTransform: TransformFn = (sourceFile: SourceFile) => {
  const sourceText = sourceFile.getFullText();
  // We prepend console.log statements to the source file
  // Note: This changes line numbers, which might affect error stack traces.
  // But for this feature, it fulfills the requirement.

  sourceFile.insertStatements(0, `console.log("--- Transforming Code ---");`);
  sourceFile.insertStatements(1, `console.log(${JSON.stringify(sourceText)});`);
  sourceFile.insertStatements(2, `console.log("----------------------");`);
};
