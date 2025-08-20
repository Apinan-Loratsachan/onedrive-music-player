import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";

const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "common";
const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || "";
const clientSecret = process.env.AZURE_CLIENT_SECRET || "";

async function refreshAccessToken(token: any) {
  try {
    if (!token?.refreshToken) {
      return { ...token, error: "NoRefreshToken" };
    }

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
      scope: "openid profile email offline_access User.Read Files.Read",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      return { ...token, error: "RefreshAccessTokenError", refreshed };
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      // expires_in is in seconds
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    AzureADProvider({
      clientId,
      clientSecret,
      tenantId,
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read Files.Read",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign in
      if (account) {
        return {
          ...token,
          accessToken: (account as any).access_token,
          refreshToken: (account as any).refresh_token,
          accessTokenExpires:
            Date.now() + ((account as any).expires_in ?? 3600) * 1000,
        };
      }

      // Return previous token if the access token has not expired yet
      if (
        token.accessToken &&
        token.accessTokenExpires &&
        Date.now() < (token.accessTokenExpires as number)
      ) {
        return token;
      }

      // Access token has expired, try to refresh it
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).error = (token as any).error;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
};

export async function getServerAccessToken(): Promise<string | null> {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  const accessToken = (session as any)?.accessToken as string | undefined;
  return accessToken ?? null;
}
