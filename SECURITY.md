# Security Policy

`reprokit` handles GitHub tokens, webhook signatures, cloned repositories, worker
logs, and generated issue comments. Please report security issues carefully and
do not publish working exploits or real secrets.

## Supported Versions

This project is early-stage. Security fixes target the `main` branch.

## Reporting a Vulnerability

If you find a vulnerability:

1. Do not open a public issue with exploit details or secrets.
2. Use GitHub's private vulnerability reporting / Security Advisory flow if it is
   enabled for the repository.
3. If private reporting is not available, open a minimal public issue that says a
   security report is needed, without including exploit details.

Please include:

- affected version or commit
- impact
- reproduction steps
- whether any token, webhook secret, private key, or repository data may have
  been exposed
- suggested fix, if known

## Secret Handling

Never commit or paste:

- `.env`
- `GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `GITHUB_PRIVATE_KEY`
- Codex or Claude credentials
- webhook payloads that include sensitive private repository data

If a secret is exposed, rotate it immediately.

## Security Expectations For Contributors

- Keep GitHub token permissions as narrow as possible.
- Use `GITHUB_WEBHOOK_SECRET` for any public webhook deployment.
- Keep redaction tests updated when new secret shapes are supported.
- Do not log authenticated remote URLs.
- Do not add auto-merge behavior.
- Be cautious with changes that execute project scripts, install dependencies, or
  pass environment variables to workers.

