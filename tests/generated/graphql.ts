import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type ApiKey = {
  __typename?: "ApiKey";
  createdAt?: Maybe<Scalars["String"]["output"]>;
  enabled?: Maybe<Scalars["Boolean"]["output"]>;
  expiresAt?: Maybe<Scalars["String"]["output"]>;
  id?: Maybe<Scalars["String"]["output"]>;
  metadata?: Maybe<Scalars["String"]["output"]>;
  name?: Maybe<Scalars["String"]["output"]>;
  organizationId?: Maybe<Scalars["String"]["output"]>;
  permissions?: Maybe<Scalars["String"]["output"]>;
  prefix?: Maybe<Scalars["String"]["output"]>;
  start?: Maybe<Scalars["String"]["output"]>;
  updatedAt?: Maybe<Scalars["String"]["output"]>;
};

export type CreatedApiKey = {
  __typename?: "CreatedApiKey";
  createdAt?: Maybe<Scalars["String"]["output"]>;
  enabled?: Maybe<Scalars["Boolean"]["output"]>;
  expiresAt?: Maybe<Scalars["String"]["output"]>;
  id?: Maybe<Scalars["String"]["output"]>;
  key?: Maybe<Scalars["String"]["output"]>;
  metadata?: Maybe<Scalars["String"]["output"]>;
  name?: Maybe<Scalars["String"]["output"]>;
  organizationId?: Maybe<Scalars["String"]["output"]>;
  permissions?: Maybe<Scalars["String"]["output"]>;
  prefix?: Maybe<Scalars["String"]["output"]>;
  start?: Maybe<Scalars["String"]["output"]>;
  updatedAt?: Maybe<Scalars["String"]["output"]>;
};

export type Mutation = {
  __typename?: "Mutation";
  createApiKey?: Maybe<CreatedApiKey>;
  deleteApiKey?: Maybe<Scalars["Boolean"]["output"]>;
  updateApiKey?: Maybe<ApiKey>;
};

export type MutationCreateApiKeyArgs = {
  metadata?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  prefix?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationDeleteApiKeyArgs = {
  id: Scalars["String"]["input"];
};

export type MutationUpdateApiKeyArgs = {
  id: Scalars["String"]["input"];
  metadata?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type Query = {
  __typename?: "Query";
  apiKey?: Maybe<ApiKey>;
  apiKeys?: Maybe<Array<ApiKey>>;
  ping?: Maybe<Scalars["String"]["output"]>;
};

export type QueryApiKeyArgs = {
  id: Scalars["String"]["input"];
};

export type CreateApiKeyMutationVariables = Exact<{
  name?: InputMaybe<Scalars["String"]["input"]>;
  prefix?: InputMaybe<Scalars["String"]["input"]>;
  metadata?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CreateApiKeyMutation = {
  __typename?: "Mutation";
  createApiKey?: {
    __typename?: "CreatedApiKey";
    id?: string | null;
    name?: string | null;
    start?: string | null;
    prefix?: string | null;
    key?: string | null;
    organizationId?: string | null;
    enabled?: boolean | null;
    expiresAt?: string | null;
    permissions?: string | null;
    metadata?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type ListApiKeysQueryVariables = Exact<{ [key: string]: never }>;

export type ListApiKeysQuery = {
  __typename?: "Query";
  apiKeys?: Array<{
    __typename?: "ApiKey";
    id?: string | null;
    name?: string | null;
    start?: string | null;
    prefix?: string | null;
    organizationId?: string | null;
    enabled?: boolean | null;
    expiresAt?: string | null;
    permissions?: string | null;
    metadata?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type GetApiKeyQueryVariables = Exact<{
  id: Scalars["String"]["input"];
}>;

export type GetApiKeyQuery = {
  __typename?: "Query";
  apiKey?: {
    __typename?: "ApiKey";
    id?: string | null;
    name?: string | null;
    start?: string | null;
    prefix?: string | null;
    organizationId?: string | null;
    enabled?: boolean | null;
    expiresAt?: string | null;
    permissions?: string | null;
    metadata?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateApiKeyMutationVariables = Exact<{
  id: Scalars["String"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  metadata?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type UpdateApiKeyMutation = {
  __typename?: "Mutation";
  updateApiKey?: {
    __typename?: "ApiKey";
    id?: string | null;
    name?: string | null;
    start?: string | null;
    prefix?: string | null;
    organizationId?: string | null;
    enabled?: boolean | null;
    expiresAt?: string | null;
    permissions?: string | null;
    metadata?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteApiKeyMutationVariables = Exact<{
  id: Scalars["String"]["input"];
}>;

export type DeleteApiKeyMutation = { __typename?: "Mutation"; deleteApiKey?: boolean | null };

export const CreateApiKeyDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateApiKey" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "name" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "prefix" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "metadata" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createApiKey" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "name" },
                value: { kind: "Variable", name: { kind: "Name", value: "name" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "prefix" },
                value: { kind: "Variable", name: { kind: "Name", value: "prefix" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "metadata" },
                value: { kind: "Variable", name: { kind: "Name", value: "metadata" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "start" } },
                { kind: "Field", name: { kind: "Name", value: "prefix" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "expiresAt" } },
                { kind: "Field", name: { kind: "Name", value: "permissions" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateApiKeyMutation, CreateApiKeyMutationVariables>;
export const ListApiKeysDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ListApiKeys" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "apiKeys" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "start" } },
                { kind: "Field", name: { kind: "Name", value: "prefix" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "expiresAt" } },
                { kind: "Field", name: { kind: "Name", value: "permissions" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ListApiKeysQuery, ListApiKeysQueryVariables>;
export const GetApiKeyDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetApiKey" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "apiKey" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "start" } },
                { kind: "Field", name: { kind: "Name", value: "prefix" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "expiresAt" } },
                { kind: "Field", name: { kind: "Name", value: "permissions" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetApiKeyQuery, GetApiKeyQueryVariables>;
export const UpdateApiKeyDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateApiKey" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "name" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "metadata" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateApiKey" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "name" },
                value: { kind: "Variable", name: { kind: "Name", value: "name" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "metadata" },
                value: { kind: "Variable", name: { kind: "Name", value: "metadata" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "start" } },
                { kind: "Field", name: { kind: "Name", value: "prefix" } },
                { kind: "Field", name: { kind: "Name", value: "organizationId" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "expiresAt" } },
                { kind: "Field", name: { kind: "Name", value: "permissions" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateApiKeyMutation, UpdateApiKeyMutationVariables>;
export const DeleteApiKeyDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteApiKey" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteApiKey" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteApiKeyMutation, DeleteApiKeyMutationVariables>;
