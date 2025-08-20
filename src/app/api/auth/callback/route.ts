import { NextRequest, NextResponse } from "next/server";

// Deprecated: NextAuth handles callback internally.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}
