/** Explicit exact origins shared by authentication and business mutations. */
export function trustedOrigins(
  baseURL: string,
  additional: string[] = [],
): string[] {
  const canonical = new URL(baseURL);
  const values = [canonical.origin, ...additional];
  return [
    ...new Set(
      values.map((value) => {
        const parsed = new URL(value);
        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash ||
          parsed.pathname !== "/" ||
          parsed.hostname.includes("*")
        ) {
          throw new Error("Trusted origins must be exact HTTP(S) origins.");
        }
        return parsed.origin;
      }),
    ),
  ];
}

export function configuredOrigins(): string[] {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) return [];
  const additional =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  return trustedOrigins(baseURL, additional);
}
