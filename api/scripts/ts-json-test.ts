// npm install ts-json-schema-generator typescript
import { Config, createFormatter, createParser, SchemaGenerator } from "ts-json-schema-generator";
import ts from "typescript";

const fileName = "virtual-file.ts";
const source = `

type Inputs = {
  a: number;
  b: number;
};
type Outputs = {
  sum: number;
};
`;

// 1. Compiler options (minimal example)
const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
};

// 2. In-memory compiler host
const host = ts.createCompilerHost(compilerOptions);

// Override the FS-related methods
host.readFile = (path) => (path === fileName ? source : undefined);
host.fileExists = (path) => path === fileName;
host.getSourceFile = (path, languageVersion) => {
  if (path !== fileName) return undefined;
  return ts.createSourceFile(path, source, languageVersion, true);
};

// 3. Create a Program from the virtual file
const program = ts.createProgram([fileName], compilerOptions, host);

// 4. Wire it into ts-json-schema-generator
const config: Config = {
  path: fileName, // just used for internal filtering, name must match
  tsconfig: undefined, // not needed, we already have a Program
  type: "*", // we'll ask for specific types below
  expose: "all",
  jsDoc: "extended",
};

// Use the low-level API instead of createGenerator(config)
const parser = createParser(program, config);
const formatter = createFormatter(config);
const generator = new SchemaGenerator(program, parser, formatter, config);

// 5. Generate JSON Schema objects for specific types
const schemaA = generator.createSchema("Inputs");
const schemaB = generator.createSchema("Outputs");

console.log(JSON.stringify(schemaA, null, 2));
console.log(JSON.stringify(schemaB, null, 2));
