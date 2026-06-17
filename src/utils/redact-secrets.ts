/**
 * Best-effort secret redaction for anything we log or paste into a public
 * GitHub comment. This is defense-in-depth: the agent already avoids reading
 * secret files, but worker stdout/stderr can still leak env values.
 *
 * Redaction is intentionally aggressive. False positives (over-redaction) are
 * acceptable; leaking a credential is not.
 */

const REDACTED = "[REDACTED]";

/** Env-var-style assignments whose VALUE must be hidden. */
const SENSITIVE_KEYS = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "PRIVATE_KEY",
  "GITHUB_PRIVATE_KEY",
  "SECRET",
  "CLIENT_SECRET",
  "WEBHOOK_SECRET",
  "TOKEN",
  "API_KEY",
  "ACCESS_KEY",
  "PASSWORD",
  "PASSWD",
];

/** Known credential token shapes, redacted wherever they appear. */
const TOKEN_PATTERNS: RegExp[] = [
  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_, github_pat_...
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // OpenAI keys
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  // Anthropic keys
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  // Slack tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Bearer <token>
  /\bBearer\s+[A-Za-z0-9._\-+/=]{10,}/gi,
  // Basic auth embedded in URLs: https://user:pass@host
  /(https?:\/\/)[^:/\s]+:[^@/\s]+@/gi,
  // PEM private key blocks
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;

  // KEY=VALUE / KEY: VALUE / "KEY": "VALUE".
  // The lookbehind stops a key from matching as the suffix of a hyphenated word
  // (e.g. "TOKEN" inside "x-access-token"), which would otherwise eat a URL.
  for (const key of SENSITIVE_KEYS) {
    const assign = new RegExp(
      `((?<![A-Za-z0-9_-])"?${key}"?\\s*[:=]\\s*"?)([^"'\\s,}]+)`,
      "gi",
    );
    out = out.replace(assign, (_m, pre) => `${pre}${REDACTED}`);
  }

  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, (match) => {
      // Preserve the protocol+user prefix for the URL-auth pattern.
      const urlAuth = match.match(/^(https?:\/\/)[^:/\s]+:/);
      if (urlAuth) return `${urlAuth[1]}${REDACTED}@`;
      if (/^Bearer/i.test(match)) return `Bearer ${REDACTED}`;
      return REDACTED;
    });
  }

  return out;
}

/** Redact, then truncate to `maxChars`, appending a note when trimmed. */
export function redactAndTruncate(input: string, maxChars: number): string {
  const redacted = redactSecrets(input ?? "");
  if (redacted.length <= maxChars) return redacted;
  const kept = redacted.slice(0, Math.max(0, maxChars));
  const dropped = redacted.length - kept.length;
  return `${kept}\n…[truncated ${dropped} characters]`;
}
