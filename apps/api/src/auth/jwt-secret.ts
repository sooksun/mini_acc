const BANNED_SECRETS = new Set(['change-me', 'change-me-in-prod-use-32-byte-random', 'secret']);
const MIN_SECRET_LENGTH = 32;

/**
 * Return the JWT signing secret, or throw on misconfiguration.
 * Fails fast at module init rather than silently signing tokens with "change-me",
 * which would let stolen secrets forge tokens against production.
 */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET is required — set a ≥32 char random string in .env');
  }
  if (BANNED_SECRETS.has(secret.trim())) {
    throw new Error(
      'JWT_SECRET is set to a known default/placeholder value — generate a real secret (e.g. `openssl rand -base64 48`)',
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters (currently ${secret.length})`,
    );
  }
  return secret;
}
