const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "github_token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { name: "github_pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "pem", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "aws", re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "openai", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "anthropic", re: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g },
  { name: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "connection_string", re: /\b(postgres|postgresql|mysql|mongodb(\+srv)?):\/\/[^\s'"]+/gi },
  { name: "basic_auth_url", re: /\bhttps?:\/\/[^/\s:]+:[^/\s@]+@[^\s'"]+/gi },
  { name: "assignment", re: /\b([A-Za-z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)[A-Za-z0-9_]*)\s*[:=]\s*['"]?[^'"\s]+['"]?/gi },
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const { re } of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

export function redactEventMessage(message: string, maxLen = 8_000): string {
  const redacted = redactSecrets(message);
  if (redacted.length <= maxLen) return redacted;
  return `${redacted.slice(0, maxLen)}\n…[truncated]`;
}
