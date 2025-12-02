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

export type { TypeCoercerParams, TypeCoercerResult } from "./type-coercer";

export enum Capability {
  CODING = "coding",
  CODING_FIRSTPASS = "coding.firstpass",
  WEB_SEARCH = "web_search",
  PLANNING = "planning",
  GENERAL = "general",
}
