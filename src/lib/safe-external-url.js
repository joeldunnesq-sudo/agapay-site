export function isUnsafeHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes(":")) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  return parts.some((part) => part > 255)
    || parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] >= 224;
}

export function validateSafeExternalUrl(value, {
  base = undefined,
  invalidMessage = "Enter a valid HTTPS address.",
  unsafeMessage = "The URL must use a public HTTPS address.",
} = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim(), base);
  } catch {
    throw new Error(invalidMessage);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw new Error(unsafeMessage);
  }
  parsed.hash = "";
  return parsed.toString();
}
