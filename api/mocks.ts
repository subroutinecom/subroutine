export const generateMockCode = (request: string): string => {
  // Generate different examples based on the request
  const lowerRequest = request.toLowerCase();

  if (lowerRequest.includes("add") || lowerRequest.includes("sum")) {
    return `// Generated from: ${request}
export async function main(inputs: any, integrations: any) {
  const a = inputs?.a ?? 5;
  const b = inputs?.b ?? 10;
  return { result: a + b, message: \`Added \${a} + \${b} = \${a + b}\` };
}`;
  }

  if (lowerRequest.includes("multiply") || lowerRequest.includes("product")) {
    return `// Generated from: ${request}
export async function main(inputs: any, integrations: any) {
  const a = inputs?.a ?? 6;
  const b = inputs?.b ?? 7;
  return { result: a * b, message: \`Multiplied \${a} * \${b} = \${a * b}\` };
}`;
  }

  if (lowerRequest.includes("fibonacci")) {
    return `// Generated from: ${request}
export async function main(inputs: any, integrations: any) {
  const n = inputs?.n ?? 10;
  const fib = [0, 1];
  for (let i = 2; i < n; i++) {
    fib[i] = fib[i - 1] + fib[i - 2];
  }
  return { sequence: fib, message: \`First \${n} Fibonacci numbers\` };
}`;
  }

  if (lowerRequest.includes("reverse") || lowerRequest.includes("string")) {
    return `// Generated from: ${request}
export async function main(inputs: any, integrations: any) {
  const text = inputs?.text ?? "Hello World";
  const reversed = text.split('').reverse().join('');
  return { original: text, reversed, message: \`Reversed: \${reversed}\` };
}`;
  }

  if (lowerRequest.includes("mock integration")) {
    return `// Generated from: ${request}
export async function main(inputs: any, { integrations }: any) {
  const message = inputs?.message ?? "hello";
  const mock = await integrations.getMockOAuth();
  const result = await mock.ping(message);
  return {
    viewerId: result.viewerId,
    echo: result.echo,
    inputMessage: message
  };
}`;
  }

  // Default hello world example with timestamp
  return `// Generated from: ${request}
export async function main(inputs: any, integrations: any) {
  const name = inputs?.name ?? "World";
  const timestamp = new Date().toISOString();
  return {
    message: \`Hello, \${name}!\`,
    timestamp,
    input: inputs
  };
}`;
};
