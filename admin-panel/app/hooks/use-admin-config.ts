import { useMatches } from "react-router";
import { useMemo } from "react";
import type { AdminClientConfig } from "~/lib/admin-config";
import { getAdminConfigFromMatches } from "~/lib/admin-config";

export const useAdminConfig = (): AdminClientConfig => {
  const matches = useMatches();

  return useMemo(() => getAdminConfigFromMatches(matches), [matches]);
};
