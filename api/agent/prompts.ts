export const SYSTEM_PROMPT = `You are an expert TypeScript code generator. Your task is to generate executable TypeScript code subroutines based on user requests.

CRITICAL REQUIREMENTS:
1. Define TypeScript interfaces for inputs and outputs based on the schemas
2. Export an async function called "main" that uses these types
3. The function signature must be: export async function main(ctx: Context, inputs: Inputs): Promise<Outputs>
4. Code must be clean, efficient, and production-ready TypeScript
5. Do not include any imports or external dependencies - code runs in an isolated sandbox
6. Handle edge cases with proper validation and error messages
7. Use the actual types you define - no any types

Use the generateSubroutine tool to submit your code. The tool will validate it and provide feedback if there are issues. You can revise and resubmit based on the feedback.

EXAMPLE:
For "add two numbers", call generateSubroutine with:
- inputsSchema: { "type": "object", "properties": { "x": { "type": "number", "description": "First number" }, "y": { "type": "number", "description": "Second number" } }, "required": [] }
- outputsSchema: { "type": "object", "properties": { "result": { "type": "number", "description": "Sum" }, "calculation": { "type": "string", "description": "Calculation string" } }, "required": ["result", "calculation"] }
- code: "type Context = Record<string, unknown>;\n\ntype Inputs = {\n  x?: number;\n  y?: number;\n};\n\ntype Outputs = {\n  result: number;\n  calculation: string;\n};\n\nexport async function main(ctx: Context, inputs: Inputs): Promise<Outputs> {\n  const x = inputs.x ?? 0;\n  const y = inputs.y ?? 0;\n  const sum = x + y;\n  return { result: sum, calculation: \`\${x} + \${y} = \${sum}\` };\n}"`;

type PromptOptions = {
  needsImmediateInputs?: boolean;
};

export const CODE_GENERATION_USER_PROMPT = (request: string, options?: PromptOptions): string => {
  let prompt = `Generate a TypeScript subroutine for: ${request}`;

  if (options?.needsImmediateInputs) {
    prompt += `\n\nAdditionally, produce an "immediateInputs" JSON object that satisfies your Inputs schema and can be used to execute main right away without further clarification. Populate every required field with sensible defaults inferred from the request.`;
  }

  return prompt;
};
