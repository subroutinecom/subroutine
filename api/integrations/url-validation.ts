/**
 * URL validation utilities for preventing SSRF attacks.
 *
 * Validates URLs to ensure they don't target internal/private resources.
 */

/** Maximum allowed size for fetched content (10 MB) */
export const MAX_FETCH_SIZE_BYTES = 10 * 1024 * 1024;

/** Default timeout for fetching external resources (10 seconds) */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Private/internal IP patterns that should be blocked.
 */
const BLOCKED_IP_PATTERNS = [
  // IPv4 localhost
  /^127\./,
  // IPv4 private ranges
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  // IPv4 link-local
  /^169\.254\./,
  // IPv4 loopback
  /^0\./,
  // IPv6 patterns (simplified - covers most cases)
  /^::1$/,
  /^::$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
];

/**
 * Blocked hostnames.
 */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  // Cloud metadata endpoints
  "metadata.google.internal",
  "metadata.goog",
  // Kubernetes internal
  "kubernetes.default",
  "kubernetes.default.svc",
];

/**
 * Result of URL validation.
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a URL for safe external fetching.
 *
 * Blocks:
 * - Private/internal IP addresses (127.x, 10.x, 172.16-31.x, 192.168.x, etc.)
 * - Localhost and related hostnames
 * - Cloud metadata endpoints
 * - Non-HTTP(S) protocols
 *
 * @param url - The URL to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateExternalUrl("http://localhost/api");
 * // { valid: false, error: "URL hostname 'localhost' is not allowed" }
 *
 * const result = validateExternalUrl("https://api.example.com/openapi.json");
 * // { valid: true }
 * ```
 */
export const validateExternalUrl = (url: string): UrlValidationResult => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      error: "must be a valid URL",
    };
  }

  // Only allow HTTP(S) protocols
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocol '${parsed.protocol.slice(0, -1)}' is not allowed. Only HTTP and HTTPS are supported.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check against blocked hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return {
      valid: false,
      error: `URL hostname '${hostname}' is not allowed`,
    };
  }

  // Check against blocked IP patterns
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: "URLs pointing to private or internal IP addresses are not allowed",
      };
    }
  }

  // Block numeric IPv4 addresses that bypass hostname checks
  // (e.g., 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(hostname)) {
    return {
      valid: false,
      error: "Numeric IP addresses are not allowed",
    };
  }

  // Block IPv4-mapped IPv6 addresses
  if (hostname.includes("::ffff:")) {
    return {
      valid: false,
      error: "IPv4-mapped IPv6 addresses are not allowed",
    };
  }

  // Block URLs with credentials
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "URLs with embedded credentials are not allowed",
    };
  }

  return { valid: true };
};

/**
 * Checks if a Content-Type header indicates JSON or YAML content.
 */
export const isValidSpecContentType = (contentType: string | null): boolean => {
  if (!contentType) {
    // Be lenient if no content-type header
    return true;
  }

  const validTypes = [
    "application/json",
    "application/yaml",
    "application/x-yaml",
    "text/yaml",
    "text/x-yaml",
    "text/plain", // Some servers return specs as text/plain
    "application/octet-stream", // Fallback for downloads
  ];

  const lowerContentType = contentType.toLowerCase();
  return validTypes.some((type) => lowerContentType.includes(type));
};
