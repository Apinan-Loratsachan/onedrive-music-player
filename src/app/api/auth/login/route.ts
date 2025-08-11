import { NextRequest, NextResponse } from "next/server";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "next-runtime-env";

const msalConfig = {
  auth: {
    clientId: env("NEXT_PUBLIC_AZURE_CLIENT_ID") || "",
    clientSecret: env("AZURE_CLIENT_SECRET") || "",
    authority: env("NEXT_PUBLIC_AZURE_TENANT_ID")
      ? `https://login.microsoftonline.com/${env(
          "NEXT_PUBLIC_AZURE_TENANT_ID"
        )}`
      : "https://login.microsoftonline.com/common",
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const prompt = searchParams.get("prompt");

    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: ["Files.Read", "User.Read"],
      redirectUri: `${request.nextUrl.origin}/api/auth/callback`,
      responseMode: "query",
      prompt: prompt === "select_account" ? "select_account" : undefined,
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
