// TODO: This needs to be pulled from the shared package.
import { parse } from "yaml";

interface AuthProviderConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
}

interface Config {
  auth: {
    providers: {
      github: AuthProviderConfig;
      google: AuthProviderConfig;
      emailPassword: AuthProviderConfig;
    };
  };
}

let cachedConfig: Config | null = null;

export const getConfig = async (): Promise<Config> => {
  if (cachedConfig) return cachedConfig;

  const configPath = "/app/admin-panel/config.yaml";
  const yamlContent = await Deno.readTextFile(configPath);
  cachedConfig = parse(yamlContent) as Config;

  return cachedConfig;
};
