import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type ApiKey = {
  __typename?: 'ApiKey';
  createdAt?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organizationId?: Maybe<Scalars['String']['output']>;
  permissions?: Maybe<Scalars['String']['output']>;
  prefix?: Maybe<Scalars['String']['output']>;
  start?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type ConnectedAccount = {
  __typename?: 'ConnectedAccount';
  accountIdentifier?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  credentials?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  integrationId?: Maybe<Scalars['String']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  organizationId?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['String']['output']>;
};

export type CreatedApiKey = {
  __typename?: 'CreatedApiKey';
  createdAt?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  key?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organizationId?: Maybe<Scalars['String']['output']>;
  permissions?: Maybe<Scalars['String']['output']>;
  prefix?: Maybe<Scalars['String']['output']>;
  start?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type Integration = {
  __typename?: 'Integration';
  authConfig?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organizationId?: Maybe<Scalars['String']['output']>;
  provider?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type IntegrationProviderDefinition = {
  __typename?: 'IntegrationProviderDefinition';
  authType?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  mcpConfig?: Maybe<IntegrationProviderMcpConfig>;
  name?: Maybe<Scalars['String']['output']>;
  oauthConfig?: Maybe<IntegrationProviderOAuthConfig>;
  viewerScoped?: Maybe<Scalars['Boolean']['output']>;
};

export type IntegrationProviderMcpConfig = {
  __typename?: 'IntegrationProviderMcpConfig';
  authStrategy?: Maybe<McpAuthStrategy>;
  serverUrl?: Maybe<Scalars['String']['output']>;
  transport?: Maybe<Scalars['String']['output']>;
};

export type IntegrationProviderOAuthConfig = {
  __typename?: 'IntegrationProviderOAuthConfig';
  authUrl?: Maybe<Scalars['String']['output']>;
  defaultRedirectPath?: Maybe<Scalars['String']['output']>;
  defaultScopes?: Maybe<Array<Scalars['String']['output']>>;
  requiredScopes?: Maybe<Array<Scalars['String']['output']>>;
  tokenUrl?: Maybe<Scalars['String']['output']>;
};

export type McpAuthStrategy = {
  __typename?: 'McpAuthStrategy';
  headerName?: Maybe<Scalars['String']['output']>;
  headers?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  createApiKey?: Maybe<CreatedApiKey>;
  createConnectedAccount?: Maybe<ConnectedAccount>;
  createIntegration?: Maybe<Integration>;
  deleteApiKey?: Maybe<Scalars['Boolean']['output']>;
  deleteConnectedAccount?: Maybe<Scalars['Boolean']['output']>;
  deleteIntegration?: Maybe<Scalars['Boolean']['output']>;
  updateApiKey?: Maybe<ApiKey>;
  updateIntegration?: Maybe<Integration>;
};


export type MutationCreateApiKeyArgs = {
  metadata?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  prefix?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateConnectedAccountArgs = {
  accountIdentifier?: InputMaybe<Scalars['String']['input']>;
  credentials: Scalars['String']['input'];
  integrationId: Scalars['String']['input'];
};


export type MutationCreateIntegrationArgs = {
  authConfig: Scalars['String']['input'];
  name: Scalars['String']['input'];
  provider: Scalars['String']['input'];
};


export type MutationDeleteApiKeyArgs = {
  id: Scalars['String']['input'];
};


export type MutationDeleteConnectedAccountArgs = {
  id: Scalars['String']['input'];
};


export type MutationDeleteIntegrationArgs = {
  id: Scalars['String']['input'];
};


export type MutationUpdateApiKeyArgs = {
  id: Scalars['String']['input'];
  metadata?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateIntegrationArgs = {
  authConfig?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type Query = {
  __typename?: 'Query';
  apiKey?: Maybe<ApiKey>;
  apiKeys?: Maybe<Array<ApiKey>>;
  connectedAccount?: Maybe<ConnectedAccount>;
  connectedAccounts?: Maybe<Array<ConnectedAccount>>;
  connectedAccountsByIntegration?: Maybe<Array<ConnectedAccount>>;
  integration?: Maybe<Integration>;
  integrationProviders?: Maybe<Array<IntegrationProviderDefinition>>;
  integrations?: Maybe<Array<Integration>>;
  ping?: Maybe<Scalars['String']['output']>;
};


export type QueryApiKeyArgs = {
  id: Scalars['String']['input'];
};


export type QueryConnectedAccountArgs = {
  id: Scalars['String']['input'];
};


export type QueryConnectedAccountsByIntegrationArgs = {
  integrationId: Scalars['String']['input'];
};


export type QueryIntegrationArgs = {
  id: Scalars['String']['input'];
};

export type GetApiKeysQueryVariables = Exact<{ [key: string]: never; }>;


export type GetApiKeysQuery = { __typename?: 'Query', apiKeys?: Array<{ __typename?: 'ApiKey', id?: string | null, name?: string | null, start?: string | null, prefix?: string | null, enabled?: boolean | null, expiresAt?: string | null, createdAt?: string | null, updatedAt?: string | null }> | null };

export type DeleteApiKeyMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DeleteApiKeyMutation = { __typename?: 'Mutation', deleteApiKey?: boolean | null };

export type CreateApiKeyMutationVariables = Exact<{
  name?: InputMaybe<Scalars['String']['input']>;
  prefix?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['String']['input']>;
}>;


export type CreateApiKeyMutation = { __typename?: 'Mutation', createApiKey?: { __typename?: 'CreatedApiKey', id?: string | null, key?: string | null, name?: string | null, prefix?: string | null, start?: string | null, createdAt?: string | null } | null };

export type GetIntegrationQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetIntegrationQuery = { __typename?: 'Query', integration?: { __typename?: 'Integration', id?: string | null, organizationId?: string | null, provider?: string | null, name?: string | null, authConfig?: string | null, enabled?: boolean | null, createdAt?: string | null, updatedAt?: string | null } | null };

export type GetConnectedAccountsQueryVariables = Exact<{
  integrationId: Scalars['String']['input'];
}>;


export type GetConnectedAccountsQuery = { __typename?: 'Query', connectedAccountsByIntegration?: Array<{ __typename?: 'ConnectedAccount', id?: string | null, integrationId?: string | null, userId?: string | null, accountIdentifier?: string | null, status?: string | null, lastUsedAt?: string | null, createdAt?: string | null, updatedAt?: string | null }> | null };

export type DeleteIntegrationMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DeleteIntegrationMutation = { __typename?: 'Mutation', deleteIntegration?: boolean | null };

export type UpdateIntegrationMutationVariables = Exact<{
  id: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  authConfig?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type UpdateIntegrationMutation = { __typename?: 'Mutation', updateIntegration?: { __typename?: 'Integration', id?: string | null, name?: string | null, enabled?: boolean | null } | null };

export type GetIntegrationsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetIntegrationsQuery = { __typename?: 'Query', integrations?: Array<{ __typename?: 'Integration', id?: string | null, organizationId?: string | null, provider?: string | null, name?: string | null, authConfig?: string | null, enabled?: boolean | null, createdAt?: string | null, updatedAt?: string | null }> | null };

export type ToggleIntegrationEnabledMutationVariables = Exact<{
  id: Scalars['String']['input'];
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type ToggleIntegrationEnabledMutation = { __typename?: 'Mutation', updateIntegration?: { __typename?: 'Integration', id?: string | null, enabled?: boolean | null } | null };

export type IntegrationProvidersQueryVariables = Exact<{ [key: string]: never; }>;


export type IntegrationProvidersQuery = { __typename?: 'Query', integrationProviders?: Array<{ __typename?: 'IntegrationProviderDefinition', id?: string | null, name?: string | null, description?: string | null, viewerScoped?: boolean | null, authType?: string | null, oauthConfig?: { __typename?: 'IntegrationProviderOAuthConfig', authUrl?: string | null, tokenUrl?: string | null, defaultScopes?: Array<string> | null, requiredScopes?: Array<string> | null, defaultRedirectPath?: string | null } | null, mcpConfig?: { __typename?: 'IntegrationProviderMcpConfig', serverUrl?: string | null, transport?: string | null, authStrategy?: { __typename?: 'McpAuthStrategy', type?: string | null, headerName?: string | null, headers?: string | null } | null } | null }> | null };

export type CreateIntegrationMutationVariables = Exact<{
  provider: Scalars['String']['input'];
  name: Scalars['String']['input'];
  authConfig: Scalars['String']['input'];
}>;


export type CreateIntegrationMutation = { __typename?: 'Mutation', createIntegration?: { __typename?: 'Integration', id?: string | null, provider?: string | null, name?: string | null } | null };


export const GetApiKeysDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetApiKeys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"apiKeys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"prefix"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetApiKeysQuery, GetApiKeysQueryVariables>;
export const DeleteApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteApiKey"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteApiKey"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteApiKeyMutation, DeleteApiKeyMutationVariables>;
export const CreateApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateApiKey"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"prefix"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"metadata"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createApiKey"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"prefix"},"value":{"kind":"Variable","name":{"kind":"Name","value":"prefix"}}},{"kind":"Argument","name":{"kind":"Name","value":"metadata"},"value":{"kind":"Variable","name":{"kind":"Name","value":"metadata"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"prefix"}},{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateApiKeyMutation, CreateApiKeyMutationVariables>;
export const GetIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"integration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"organizationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"authConfig"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetIntegrationQuery, GetIntegrationQueryVariables>;
export const GetConnectedAccountsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetConnectedAccounts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"integrationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectedAccountsByIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"integrationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"integrationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"integrationId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"accountIdentifier"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetConnectedAccountsQuery, GetConnectedAccountsQueryVariables>;
export const DeleteIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteIntegrationMutation, DeleteIntegrationMutationVariables>;
export const UpdateIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"authConfig"},"value":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}}},{"kind":"Argument","name":{"kind":"Name","value":"enabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]}}]} as unknown as DocumentNode<UpdateIntegrationMutation, UpdateIntegrationMutationVariables>;
export const GetIntegrationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetIntegrations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"integrations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"organizationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"authConfig"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetIntegrationsQuery, GetIntegrationsQueryVariables>;
export const ToggleIntegrationEnabledDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ToggleIntegrationEnabled"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"enabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]}}]} as unknown as DocumentNode<ToggleIntegrationEnabledMutation, ToggleIntegrationEnabledMutationVariables>;
export const IntegrationProvidersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IntegrationProviders"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"integrationProviders"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"viewerScoped"}},{"kind":"Field","name":{"kind":"Name","value":"authType"}},{"kind":"Field","name":{"kind":"Name","value":"oauthConfig"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"authUrl"}},{"kind":"Field","name":{"kind":"Name","value":"tokenUrl"}},{"kind":"Field","name":{"kind":"Name","value":"defaultScopes"}},{"kind":"Field","name":{"kind":"Name","value":"requiredScopes"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRedirectPath"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mcpConfig"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"serverUrl"}},{"kind":"Field","name":{"kind":"Name","value":"transport"}},{"kind":"Field","name":{"kind":"Name","value":"authStrategy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"headerName"}},{"kind":"Field","name":{"kind":"Name","value":"headers"}}]}}]}}]}}]}}]} as unknown as DocumentNode<IntegrationProvidersQuery, IntegrationProvidersQueryVariables>;
export const CreateIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"provider"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"provider"},"value":{"kind":"Variable","name":{"kind":"Name","value":"provider"}}},{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"authConfig"},"value":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<CreateIntegrationMutation, CreateIntegrationMutationVariables>;