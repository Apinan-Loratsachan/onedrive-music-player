import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // With NextAuth we can simply respond OK; client uses signOut()
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
