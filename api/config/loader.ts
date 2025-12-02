import { parse } from "yaml";
import { type Config, configSchema } from "./schema.ts";
import { printConfigReport, validateConfig } from "./validator.ts";

let cachedConfig: Config | null = null;

export const loadConfig = async (path: string): Promise<Config> => {
  let yamlContent = await Deno.readTextFile(path);

  // Environment variable interpolation
  // Supports $VAR and ${VAR} syntax
  yamlContent = yamlContent.replace(/\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g, (match, varName) => {
    const value = Deno.env.get(varName);
    return value !== undefined ? value : match;
  });

  const parsed = parse(yamlContent);

  const result = configSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Config validation failed:\n${errors}`);
  }

  const config = result.data;

  if (!config.baseUrl) {
    config.baseUrl = "http://localhost";
  }
  if (!config.apiUrl && config.baseUrl) {
    config.apiUrl = config.baseUrl;
  }

  // Validate config consistency
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(
      `Config validation failed:\n${validation.errors.map((e: string) => `  - ${e}`).join("\n")}`
    );
  }

  // Optional verbose output for debugging
  if (Deno.env.get("VERBOSE_CONFIG") === "true") {
    printConfigReport(config);
  }

  return config;
};

const findConfigPath = (): string => {
  // Search order: env var, Docker path, local path, parent dir
  const envPath = Deno.env.get("CONFIG_PATH");
  if (envPath) return envPath;

  const candidates = [
    "/app/config.yaml",
    "./config.yaml",
    "../config.yaml",
    "/config.yaml",
    "/app/config.yaml",
  ];

  for (const path of candidates) {
    try {
      Deno.statSync(path);
      return path;
    } catch {
      continue;
    }
  }

  throw new Error(
    "config.yaml not found. Set CONFIG_PATH env var or place config.yaml in project root."
  );
};

export const getConfig = async (): Promise<Config> => {
  if (cachedConfig) return cachedConfig;

  const configPath = findConfigPath();
  cachedConfig = await loadConfig(configPath);
  return cachedConfig;
};

export const resetConfigCache = (): void => {
  cachedConfig = null;
};
