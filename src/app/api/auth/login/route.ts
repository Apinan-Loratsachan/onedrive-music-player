import { NextRequest, NextResponse } from "next/server";
import { ConfidentialClientApplication } from "@azure/msal-node";

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${
      process.env.AZURE_TENANT_ID || "common"
    }`,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

export async function GET(request: NextRequest) {
  try {
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: ["Files.Read", "User.Read"],
      redirectUri:
        process.env.AZURE_REDIRECT_URI ||
        "http://localhost:3000/api/auth/callback",
      responseMode: "query",
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
