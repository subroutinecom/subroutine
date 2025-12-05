import reservedSlugs from "../data/reserved-slugs.json" with { type: "json" };
import { db } from "../db/index";

export const SLUG_MIN_LENGTH = 6;
export const SLUG_MAX_LENGTH = 64;

// Pattern: starts with alphanumeric, can have hyphens in middle, ends with alphanumeric
// For slugs of exactly 1 char, we use a simpler check, but since min is 6, this pattern works
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Create a Set for O(1) lookup
const reservedSlugsSet = new Set(reservedSlugs.map((s: string) => s.toLowerCase()));

export interface SlugValidationResult {
  valid: boolean;
  error?: string;
}

export const validateSlugFormat = (slug: string): SlugValidationResult => {
  // Check if empty
  if (!slug) {
    return { valid: false, error: "Slug is required" };
  }

  // Check minimum length
  if (slug.length < SLUG_MIN_LENGTH) {
    return { valid: false, error: `Slug must be at least ${SLUG_MIN_LENGTH} characters long` };
  }

  // Check maximum length
  if (slug.length > SLUG_MAX_LENGTH) {
    return { valid: false, error: `Slug cannot exceed ${SLUG_MAX_LENGTH} characters` };
  }

  // Check pattern (lowercase alphanumeric and hyphens, no leading/trailing hyphens)
  if (!SLUG_PATTERN.test(slug)) {
    if (slug.startsWith("-") || slug.endsWith("-")) {
      return { valid: false, error: "Slug cannot start or end with a hyphen" };
    }
    return { valid: false, error: "Slug can only contain lowercase letters, numbers, and hyphens" };
  }

  // Check for consecutive hyphens
  if (slug.includes("--")) {
    return { valid: false, error: "Slug cannot contain consecutive hyphens" };
  }

  // Check against reserved words
  if (reservedSlugsSet.has(slug.toLowerCase())) {
    return { valid: false, error: "This slug is reserved and cannot be used" };
  }

  return { valid: true };
};

export const isSlugAvailable = async (slug: string): Promise<boolean> => {
  const existing = await db
    .selectFrom("organization")
    .select("id")
    .where("slug", "=", slug.toLowerCase())
    .executeTakeFirst();

  return !existing;
};

export interface SlugValidationWithAvailabilityResult extends SlugValidationResult {
  available?: boolean;
}

export const validateSlug = async (slug: string): Promise<SlugValidationWithAvailabilityResult> => {
  // First validate format
  const formatResult = validateSlugFormat(slug);
  if (!formatResult.valid) {
    return formatResult;
  }

  // Check availability
  const available = await isSlugAvailable(slug);
  if (!available) {
    return { valid: false, error: "This slug is already taken", available: false };
  }

  return { valid: true, available: true };
};

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-"); // Collapse consecutive hyphens
};
