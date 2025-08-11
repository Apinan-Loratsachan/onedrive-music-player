import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Create response to clear cookies
    const response = NextResponse.json({ success: true });

    // Clear all authentication cookies
    response.cookies.set("access_token", "", {
      expires: new Date(0),
      path: "/",
    });

    response.cookies.set("refresh_token", "", {
      expires: new Date(0),
      path: "/",
    });

    response.cookies.set("user_profile", "", {
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
