import { awaitMcpClient } from "./await-mcp-client.ts";
import { mainMustBeAsync } from "./main-must-be-async.ts";
import { mainMustBeExported } from "./main-must-be-exported.ts";
import { mainMustReturnOutputs } from "./main-must-return-outputs.ts";
import { mustDefineInputsType } from "./must-define-inputs-type.ts";
import { mustDefineOutputsType } from "./must-define-outputs-type.ts";
import { noCtxParam } from "./no-ctx-param.ts";
import { noNestedImports } from "./no-nested-imports.ts";
import { noNetworkFetch } from "./no-network-fetch.ts";
import { noUndefinedReferences } from "./no-undefined-references.ts";
import { onlyAllowStandardIntegrationsMethods } from "./only-allow-standard-integrations-methods.ts";
import { validateGraphqlQueries } from "./validate-graphql-schema.ts";
import { validateOpenAPICalls } from "./validate-openapi-schema.ts";
import { verifyIntegrationNamesExist } from "./verify-integration-names-exist.ts";

export const rules = {
  "await-mcp-client": awaitMcpClient,
  "main-must-be-async": mainMustBeAsync,
  "main-must-be-exported": mainMustBeExported,
  "main-must-return-outputs": mainMustReturnOutputs,
  "must-define-inputs-type": mustDefineInputsType,
  "must-define-outputs-type": mustDefineOutputsType,
  "no-ctx-param": noCtxParam,
  "no-nested-imports": noNestedImports,
  "no-network-fetch": noNetworkFetch,
  "no-undefined-references": noUndefinedReferences,
  "only-allow-standard-integrations-methods": onlyAllowStandardIntegrationsMethods,
  "validate-graphql-queries": validateGraphqlQueries,
  "validate-openapi-calls": validateOpenAPICalls,
  "verify-integration-names-exist": verifyIntegrationNamesExist,
};
