import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createDb, databaseUrlForInit } from "@atrium/db";
import * as schema from "@atrium/db/schema";

export const auth = betterAuth({
  appName: "Atrium",
  database: drizzleAdapter(createDb(databaseUrlForInit()), {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  account: {
    encryptOAuthTokens: true,
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
