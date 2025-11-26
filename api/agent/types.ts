export type CodeGenerationResult = {
  success: boolean;
  source: string;
  inputsSchema: Record<string, unknown>;
  outputsSchema: Record<string, unknown>;
  immediateInputs?: Record<string, unknown>;
  iterations: number;
  error?: string;

  usedIntegrationIds?: string[];
};
