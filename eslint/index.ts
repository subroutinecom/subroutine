import noConsoleWithout from "./no-console-without-text.ts";
import noGraphqlFetch from "./no-graphql-fetch.ts";
import noRoutesImports from "./no-routes-imports.ts";
import noWindowSessionOrLocalStorage from "./no-window-session-or-local-storage.ts";
import onlyFieldWithInputMutations from "./only-fieldWithInput-mutations.ts";

export const localRulesPlugin = {
  rules: {
    "no-console-without-text": noConsoleWithout,
    "no-graphql-fetch": noGraphqlFetch,
    "no-routes-imports": noRoutesImports,
    "no-window-session-or-local-storage": noWindowSessionOrLocalStorage,
    "only-fieldWithInput-mutations": onlyFieldWithInputMutations,
  },
};
