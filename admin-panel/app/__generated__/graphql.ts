import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
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
  createdAt: Scalars['String']['output'];
  credentials: Scalars['String']['output'];
  id: Scalars['String']['output'];
  integrationId: Scalars['String']['output'];
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  organizationId: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
  userId: Scalars['String']['output'];
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
  authConfig: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  organizationId: Scalars['String']['output'];
  provider: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
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

export type GetIntegrationQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetIntegrationQuery = { __typename?: 'Query', integration?: { __typename?: 'Integration', id: string, organizationId: string, provider: string, name: string, authConfig: string, enabled: boolean, createdAt: string, updatedAt: string } | null };

export type GetConnectedAccountsQueryVariables = Exact<{
  integrationId: Scalars['String']['input'];
}>;


export type GetConnectedAccountsQuery = { __typename?: 'Query', connectedAccountsByIntegration?: Array<{ __typename?: 'ConnectedAccount', id: string, integrationId: string, userId: string, accountIdentifier?: string | null, status: string, lastUsedAt?: string | null, createdAt: string, updatedAt: string }> | null };

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


export type UpdateIntegrationMutation = { __typename?: 'Mutation', updateIntegration?: { __typename?: 'Integration', id: string, name: string, enabled: boolean } | null };

export type GetIntegrationsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetIntegrationsQuery = { __typename?: 'Query', integrations?: Array<{ __typename?: 'Integration', id: string, organizationId: string, provider: string, name: string, authConfig: string, enabled: boolean, createdAt: string, updatedAt: string }> | null };

export type ToggleIntegrationEnabledMutationVariables = Exact<{
  id: Scalars['String']['input'];
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type ToggleIntegrationEnabledMutation = { __typename?: 'Mutation', updateIntegration?: { __typename?: 'Integration', id: string, enabled: boolean } | null };

export type CreateIntegrationMutationVariables = Exact<{
  provider: Scalars['String']['input'];
  name: Scalars['String']['input'];
  authConfig: Scalars['String']['input'];
}>;


export type CreateIntegrationMutation = { __typename?: 'Mutation', createIntegration?: { __typename?: 'Integration', id: string, provider: string, name: string } | null };


export const GetIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"integration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"organizationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"authConfig"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetIntegrationQuery, GetIntegrationQueryVariables>;
export const GetConnectedAccountsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetConnectedAccounts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"integrationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectedAccountsByIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"integrationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"integrationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"integrationId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"accountIdentifier"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetConnectedAccountsQuery, GetConnectedAccountsQueryVariables>;
export const DeleteIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteIntegrationMutation, DeleteIntegrationMutationVariables>;
export const UpdateIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"authConfig"},"value":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}}},{"kind":"Argument","name":{"kind":"Name","value":"enabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]}}]} as unknown as DocumentNode<UpdateIntegrationMutation, UpdateIntegrationMutationVariables>;
export const GetIntegrationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetIntegrations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"integrations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"organizationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"authConfig"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetIntegrationsQuery, GetIntegrationsQueryVariables>;
export const ToggleIntegrationEnabledDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ToggleIntegrationEnabled"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"enabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]}}]} as unknown as DocumentNode<ToggleIntegrationEnabledMutation, ToggleIntegrationEnabledMutationVariables>;
export const CreateIntegrationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateIntegration"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"provider"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createIntegration"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"provider"},"value":{"kind":"Variable","name":{"kind":"Name","value":"provider"}}},{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"authConfig"},"value":{"kind":"Variable","name":{"kind":"Name","value":"authConfig"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<CreateIntegrationMutation, CreateIntegrationMutationVariables>;