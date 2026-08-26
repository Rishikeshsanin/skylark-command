const CREDENTIAL_REFERENCE = /^(?:env|vercel|vault|secret-manager|supabase-vault):[A-Za-z0-9._:/-]{1,240}$/;

function isSecretField(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("privatekey") ||
    normalized.includes("apikey") ||
    normalized.includes("servicekey") ||
    normalized.includes("servicerole") ||
    normalized.includes("accesskey");
}

function scanForSecrets(value: unknown, path = "config"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretField(key)) {
      throw new Error(`Connector configuration may not contain secret field ${path}.${key}.`);
    }
    scanForSecrets(nested, `${path}.${key}`);
  }
}

export function validateCredentialReference(value: string): string {
  const normalized = value.trim();
  if (!CREDENTIAL_REFERENCE.test(normalized)) {
    throw new Error("Connector credentials must be stored as an opaque secret-manager reference.");
  }
  return normalized;
}

export function assertConnectorConfigContainsNoSecrets(config: Record<string, unknown>): void {
  scanForSecrets(config);
}
