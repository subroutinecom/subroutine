import { parse } from "@std/yaml";
import { configSchema, type Config } from "./schema.ts";

let cachedConfig: Config | null = null;

export const loadConfig = async (path: string): Promise<Config> => {
  const yamlContent = await Deno.readTextFile(path);
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

  return config;
};

const findConfigPath = (): string => {
  // Search order: env var, Docker path, local path, parent dir
  const envPath = Deno.env.get("CONFIG_PATH");
  if (envPath) return envPath;

  const candidates = ["/app/config.yaml", "./config.yaml", "../config.yaml"];

  for (const path of candidates) {
    try {
      Deno.statSync(path);
      return path;
    } catch {
      continue;
    }
  }

  throw new Error(
    "config.yaml not found. Set CONFIG_PATH env var or place config.yaml in project root.",
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
