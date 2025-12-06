/**
 * GraphQL operation validation against a stored schema.
 *
 * Validates operations (queries, mutations, subscriptions) against
 * a GraphQL schema SDL to catch errors before execution.
 */

import { buildSchema, parse, validate, type GraphQLError, Source } from "graphql";

/**
 * Validation error details.
 */
export interface ValidationError {
  /** Human-readable error message */
  message: string;
  /** Line number in the operation (1-indexed) */
  line?: number;
  /** Column number in the operation (1-indexed) */
  column?: number;
  /** Path to the problematic field (if applicable) */
  path?: string[];
}

/**
 * Result of validating a GraphQL operation.
 */
export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/**
 * Converts GraphQL library errors to our simplified format.
 */
const convertErrors = (errors: readonly GraphQLError[]): ValidationError[] => {
  return errors.map((error) => {
    const location = error.locations?.[0];
    return {
      message: error.message,
      line: location?.line,
      column: location?.column,
      path: error.path?.map(String),
    };
  });
};

/**
 * Validates a GraphQL operation against a schema.
 *
 * @param schemaSDL - The schema in SDL format
 * @param operation - The GraphQL operation to validate (query, mutation, or subscription)
 * @returns Validation result with any errors
 *
 * @example
 * ```typescript
 * const result = validateOperation(schema, `
 *   query GetUser($id: ID!) {
 *     user(id: $id) {
 *       id
 *       name
 *       invalidField  // This will cause a validation error
 *     }
 *   }
 * `);
 *
 * if (!result.valid) {
 *   console.log('Validation errors:', result.errors);
 * }
 * ```
 */
export const validateOperation = (
  schemaSDL: string,
  operation: string
): ValidationResult => {
  try {
    // Parse the schema
    const schema = buildSchema(schemaSDL);

    // Parse the operation
    const document = parse(new Source(operation, "Operation"));

    // Validate the operation against the schema
    const errors = validate(schema, document);

    if (errors.length > 0) {
      return {
        valid: false,
        errors: convertErrors(errors),
      };
    }

    return { valid: true };
  } catch (err) {
    // Handle parse errors (syntax errors in schema or operation)
    if (err instanceof Error) {
      // Try to extract location from GraphQL parse errors
      const graphqlError = err as GraphQLError;
      const location = graphqlError.locations?.[0];

      return {
        valid: false,
        errors: [
          {
            message: err.message,
            line: location?.line,
            column: location?.column,
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [{ message: String(err) }],
    };
  }
};

/**
 * Validates the schema SDL itself.
 *
 * @param schemaSDL - The schema in SDL format
 * @returns Validation result
 */
export const validateSchema = (schemaSDL: string): ValidationResult => {
  try {
    buildSchema(schemaSDL);
    return { valid: true };
  } catch (err) {
    if (err instanceof Error) {
      const graphqlError = err as GraphQLError;
      const location = graphqlError.locations?.[0];

      return {
        valid: false,
        errors: [
          {
            message: err.message,
            line: location?.line,
            column: location?.column,
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [{ message: String(err) }],
    };
  }
};

/**
 * Cache for parsed schemas to avoid repeated parsing.
 */
const schemaCache = new Map<string, ReturnType<typeof buildSchema>>();

/**
 * Validates an operation with schema caching for better performance
 * when validating multiple operations against the same schema.
 *
 * @param schemaSDL - The schema in SDL format
 * @param operation - The GraphQL operation to validate
 * @returns Validation result
 */
export const validateOperationCached = (
  schemaSDL: string,
  operation: string
): ValidationResult => {
  try {
    // Get cached schema or parse and cache it
    let schema = schemaCache.get(schemaSDL);
    if (!schema) {
      schema = buildSchema(schemaSDL);
      schemaCache.set(schemaSDL, schema);

      // Limit cache size to prevent memory leaks
      if (schemaCache.size > 100) {
        const firstKey = schemaCache.keys().next().value;
        if (firstKey) {
          schemaCache.delete(firstKey);
        }
      }
    }

    // Parse and validate the operation
    const document = parse(new Source(operation, "Operation"));
    const errors = validate(schema, document);

    if (errors.length > 0) {
      return {
        valid: false,
        errors: convertErrors(errors),
      };
    }

    return { valid: true };
  } catch (err) {
    if (err instanceof Error) {
      const graphqlError = err as GraphQLError;
      const location = graphqlError.locations?.[0];

      return {
        valid: false,
        errors: [
          {
            message: err.message,
            line: location?.line,
            column: location?.column,
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [{ message: String(err) }],
    };
  }
};

/**
 * Clears the schema cache. Useful for testing or when schemas are updated.
 */
export const clearSchemaCache = (): void => {
  schemaCache.clear();
};
