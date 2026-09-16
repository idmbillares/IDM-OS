import "server-only";

export function requireServerEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno obligatoria ${name}.`);
  return value;
}

export function requireCanonicalAuthUrl() {
  const value = requireServerEnvironment("AUTH_URL");

  try {
    const url = new URL(value);
    const productionRequiresHttps = process.env.NODE_ENV === "production";
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      (productionRequiresHttps && !isLocalhost && url.protocol !== "https:") ||
      url.pathname !== "/" ||
      value !== url.origin
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      "AUTH_URL debe ser el origen canónico de IDM OS, sin ruta ni barra final.",
    );
  }
}

export function normalizePemCertificate(value: string) {
  const certificate = value.replace(/\\n/g, "\n").trim();
  if (
    !certificate.startsWith("-----BEGIN CERTIFICATE-----") ||
    !certificate.endsWith("-----END CERTIFICATE-----")
  ) {
    throw new Error("El certificado TLS de PostgreSQL no tiene formato PEM válido.");
  }
  return `${certificate}\n`;
}
