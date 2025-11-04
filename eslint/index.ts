import noAnchorTags from "./no-anchor-tags";
import noConsoleWithout from "./no-console-without-text";
import noGraphqlFetch from "./no-graphql-fetch";
import noRoutesImports from "./no-routes-imports";
import noWindowSessionOrLocalStorage from "./no-window-session-or-local-storage";
import onlyFieldWithInputMutations from "./only-fieldWithInput-mutations";

export const localRulesPlugin = {
  rules: {
    "no-anchor-tags": noAnchorTags,
    "no-console-without-text": noConsoleWithout,
    "no-graphql-fetch": noGraphqlFetch,
    "no-routes-imports": noRoutesImports,
    "no-window-session-or-local-storage": noWindowSessionOrLocalStorage,
    "only-fieldWithInput-mutations": onlyFieldWithInputMutations,
  },
};
