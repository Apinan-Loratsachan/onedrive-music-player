import { NextRequest, NextResponse } from "next/server";

// Deprecated: handled by NextAuth. Keep for backward-compat temporary.
export async function GET(request: NextRequest) {
  const url = new URL("/api/auth/signin", request.url);
  url.searchParams.set("callbackUrl", new URL("/", request.url).toString());
  return NextResponse.redirect(url);
}
