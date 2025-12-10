import loggerNameMatch from "./logger-name-match.ts";
import loggerArgPattern from "./logger-arg-pattern.ts";
import noBetterAuthLogger from "./no-better-auth-logger.ts";
import noConsole from "./no-console.ts";
import noGraphqlFetch from "./no-graphql-fetch.ts";
import noRoutesImports from "./no-routes-imports.ts";
import noWindowSessionOrLocalStorage from "./no-window-session-or-local-storage.ts";
import onlyFieldWithInputMutations from "./only-fieldWithInput-mutations.ts";

export const localRulesPlugin = {
  rules: {
    "no-graphql-fetch": noGraphqlFetch,
    "no-routes-imports": noRoutesImports,
    "no-window-session-or-local-storage": noWindowSessionOrLocalStorage,
    "only-fieldWithInput-mutations": onlyFieldWithInputMutations,
    "no-console": noConsole,
    "logger-name-match": loggerNameMatch,
    "logger-arg-pattern": loggerArgPattern,
    "no-better-auth-logger": noBetterAuthLogger,
  },
};
