import { Project } from "ts-morph";
import { logCodeTransform } from "./log-code.ts";
import { pmarkerTransform } from "./pmarker.ts";
import type { TransformFn } from "./types.ts";

const transforms: TransformFn[] = [
  pmarkerTransform,
  logCodeTransform,
];

export const applyTransforms = async (code: string): Promise<string> => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
    }
  });
  
  const sourceFile = project.createSourceFile("main.ts", code);

  for (const transform of transforms) {
    await transform(sourceFile);
  }

  return sourceFile.getFullText();
};
