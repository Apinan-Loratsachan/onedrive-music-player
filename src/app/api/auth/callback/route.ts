import { NextRequest, NextResponse } from "next/server";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "next-runtime-env";

const msalConfig = {
  auth: {
    clientId: env("NEXT_PUBLIC_AZURE_CLIENT_ID") || "",
    clientSecret: env("AZURE_CLIENT_SECRET") || "",
    authority: `https://login.microsoftonline.com/${
      env("AZURE_TENANT_ID") || "common"
    }`,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/?error=" + error, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/?error=no_code", request.url));
    }

    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: ["Files.Read", "User.Read"],
      redirectUri:
        env("AZURE_REDIRECT_URI") || "http://localhost:3000/api/auth/callback",
    });

    if (tokenResponse) {
      // Store tokens in cookies (in production, consider using secure HTTP-only cookies)
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.set("access_token", tokenResponse.accessToken!, {
        httpOnly: true,
        secure: env("NODE_ENV") === "production",
        sameSite: "lax",
        maxAge: 3600, // 1 hour
      });

      return response;
    }

    return NextResponse.redirect(new URL("/?error=token_failed", request.url));
  } catch (error) {
    console.error("Error in callback:", error);
    return NextResponse.redirect(
      new URL("/?error=callback_failed", request.url)
    );
  }
}
