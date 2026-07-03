import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGitHubAppJwt,
  githubClientFromGitHubAppInstallation,
} from "../src/github/github-client.ts";
import { githubProviderForTool } from "../src/tool-helpers.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("GitHub App auth helpers", () => {
  it("mints an installation token and returns a GitHub client", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const client = await githubClientFromGitHubAppInstallation({
      appId: "12345",
      privateKey: pem,
      installationId: 67890,
      baseUrl: "https://api.github.test",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ token: "installation-token" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      now: new Date("2026-07-03T12:00:00Z"),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.github.test/app/installations/67890/access_tokens",
    );
    expect(calls[0]!.init.method).toBe("POST");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("authorization")).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
    expect(client.authedRemoteUrl("owner", "repo")).toContain(
      "installation-token",
    );
  });

  it("creates stable GitHub App JWT claims", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const jwt = createGitHubAppJwt({
      appId: "42",
      privateKey: pem,
      now: new Date("2026-07-03T12:00:00Z"),
    });
    const [, payload] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());

    expect(claims).toMatchObject({
      iss: "42",
      iat: 1783079940,
      exp: 1783080540,
    });
  });

  it("infers repository coordinates from Eve GitHub auth context", async () => {
    process.env.GITHUB_TOKEN = "token";
    delete process.env.GITHUB_OWNER;
    delete process.env.GITHUB_REPO;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    const provider = await githubProviderForTool({
      session: {
        auth: {
          current: {
            attributes: {
              repository: "octo/reprokit",
              installation_id: "123",
            },
          },
        },
      },
    });

    expect(provider.repoCoords).toEqual({ owner: "octo", repo: "reprokit" });
  });
});
