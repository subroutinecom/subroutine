import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { gql } from "graphql-request";
import { getAuthClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";
import { useAdminConfig } from "~/hooks/use-admin-config";
import { createGraphqlClient } from "~/lib/graphql-client";

const VALIDATE_SLUG_QUERY = gql`
  query ValidateSlug($slug: String!) {
    validateSlug(slug: $slug) {
      valid
      error
      available
    }
  }
`;

type SlugValidationResult = {
  valid: boolean;
  error?: string | null;
  available?: boolean | null;
};

type OrganizationFormData = {
  organizationName: string;
};

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
};

export default function SetupOrganization() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const graphqlClient = useMemo(() => createGraphqlClient(config), [config]);
  const { isAuthenticated, organizations, isLoading: authLoading, refetch } = useAuth();
  const [serverError, setServerError] = useState("");
  const [slugValidation, setSlugValidation] = useState<SlugValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationFormData>();

  const organizationName = watch("organizationName", "");
  const currentSlug = generateSlug(organizationName);

  // Validate slug via GraphQL with debounce
  const validateSlug = useCallback(
    async (slug: string) => {
      if (!slug) {
        setSlugValidation(null);
        return;
      }

      setIsValidating(true);
      try {
        const result = await graphqlClient.request<{ validateSlug: SlugValidationResult }>(
          VALIDATE_SLUG_QUERY,
          { slug }
        );
        setSlugValidation(result.validateSlug);
      } catch {
        setSlugValidation({ valid: false, error: "Failed to validate slug" });
      } finally {
        setIsValidating(false);
      }
    },
    [graphqlClient]
  );

  // Debounced validation effect
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!currentSlug) {
      setSlugValidation(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      validateSlug(currentSlug);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [currentSlug, validateSlug]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Redirect if user already has organizations
  useEffect(() => {
    if (!authLoading && organizations.length > 0) {
      navigate("/");
    }
  }, [authLoading, organizations, navigate]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const onSubmit = async (data: OrganizationFormData) => {
    setServerError("");

    const slug = generateSlug(data.organizationName);
    if (!slug) {
      setServerError("Organization name must contain at least one alphanumeric character");
      return;
    }

    // Re-validate slug before submission
    if (!slugValidation?.valid) {
      setServerError(slugValidation?.error || "Invalid slug");
      return;
    }

    try {
      const { data: organization, error: createError } = await authClient.organization.create({
        name: data.organizationName.trim(),
        slug,
      });

      if (createError) {
        setServerError(createError.message || "Failed to create organization");
        return;
      }

      if (!organization) {
        setServerError("Failed to create organization");
        return;
      }

      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId: organization.id,
      });

      if (setActiveError) {
        setServerError(setActiveError.message || "Failed to set organization as active");
        return;
      }

      await refetch();

      navigate("/");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-2">Create Your Organization</h2>
          <p className="text-sm text-base-content/70 mb-4">
            To get started, create an organization. You'll be able to invite team members later.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Organization Name</label>
              <input
                type="text"
                {...register("organizationName", {
                  required: "Organization name is required",
                })}
                placeholder="Acme Inc"
                className="input input-bordered w-full"
                disabled={isSubmitting}
                autoFocus
              />
              {errors.organizationName && (
                <p className="text-xs text-error mt-1">{errors.organizationName.message}</p>
              )}
              {organizationName && (
                <div className="mt-2">
                  <p className="text-xs text-base-content/50">
                    Slug: <span className="font-mono">{currentSlug || "(invalid)"}</span>
                    {isValidating && (
                      <span className="loading loading-spinner loading-xs ml-2"></span>
                    )}
                  </p>
                  {!isValidating && slugValidation && !slugValidation.valid && (
                    <p className="text-xs text-error mt-1">{slugValidation.error}</p>
                  )}
                  {!isValidating && slugValidation?.valid && (
                    <p className="text-xs text-success mt-1">Slug is available</p>
                  )}
                </div>
              )}
            </div>

            {serverError && (
              <div className="alert alert-error">
                <span>{serverError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isSubmitting || isValidating || !slugValidation?.valid}
            >
              {isSubmitting ? (
                <span className="loading loading-spinner"></span>
              ) : (
                "Create Organization"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
