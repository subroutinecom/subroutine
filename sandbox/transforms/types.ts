import { SourceFile } from "ts-morph";

export type TransformFn = (sourceFile: SourceFile) => void | Promise<void>;
