import { NextRequest, NextResponse } from "next/server";
import {
  getUserSettings,
  setUserSettings,
  updateUserSettings,
  getUserIdFromGraphAPI,
  clearUserCache,
} from "@/lib/storage";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    // Get user ID from Microsoft Graph API
    const userId = await getUserIdFromGraphAPI(accessToken);

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    const settings = await getUserSettings(userId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error getting user settings:", error);
    return NextResponse.json(
      { error: "Failed to get user settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    // Get user ID from Microsoft Graph API
    const userId = await getUserIdFromGraphAPI(accessToken);

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { musicRootPath } = body as { musicRootPath: string };

    if (typeof musicRootPath !== "string") {
      return NextResponse.json(
        { error: "Invalid music root path" },
        { status: 400 }
      );
    }

    // Validate the path format (basic validation)
    // Allow empty paths (they represent OneDrive root)
    if (musicRootPath.includes("..")) {
      return NextResponse.json(
        { error: "Invalid path format" },
        { status: 400 }
      );
    }

    // Get current settings to check if root path is actually changing
    const currentSettings = await getUserSettings(userId);
    const isRootPathChanging =
      currentSettings?.musicRootPath !== musicRootPath.trim();

    // Update the settings
    await setUserSettings(userId, { musicRootPath: musicRootPath.trim() });

    // If the root path changed, clear the cache to force a fresh scan
    if (isRootPathChanging) {
      try {
        await clearUserCache(userId);
        
        // Also clear the scan state to reset scanning status
        try {
          const response = await fetch(`${request.nextUrl.origin}/api/music/scan`, {
            method: 'DELETE',
            headers: {
              'Cookie': `access_token=${request.cookies.get("access_token")?.value}`,
            },
          });
          if (!response.ok) {
            console.warn("Failed to clear scan state after root path change");
          }
        } catch (scanError) {
          console.warn("Failed to clear scan state after root path change:", scanError);
        }
      } catch (cacheError) {
        console.warn(
          "Failed to clear cache after root path change:",
          cacheError
        );
        // Don't fail the request if cache clearing fails
      }
    }

    return NextResponse.json({
      message: "Settings updated successfully",
      musicRootPath: musicRootPath.trim(),
      cacheCleared: isRootPathChanging,
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    // Get user ID from Microsoft Graph API
    const userId = await getUserIdFromGraphAPI(accessToken);

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const updates = body as Partial<{ musicRootPath: string }>;

    if (updates.musicRootPath !== undefined) {
      if (
        typeof updates.musicRootPath !== "string" ||
        updates.musicRootPath.includes("..")
      ) {
        return NextResponse.json(
          { error: "Invalid music root path" },
          { status: 400 }
        );
      }
      updates.musicRootPath = updates.musicRootPath.trim();
    }

    // Check if root path is actually changing
    let isRootPathChanging = false;
    if (updates.musicRootPath !== undefined) {
      const currentSettings = await getUserSettings(userId);
      isRootPathChanging =
        currentSettings?.musicRootPath !== updates.musicRootPath;
    }

    // Update the settings
    await updateUserSettings(userId, updates);

    // If the root path changed, clear the cache to force a fresh scan
    if (isRootPathChanging) {
      try {
        await clearUserCache(userId);
        
        // Also clear the scan state to reset scanning status
        try {
          const response = await fetch(`${request.nextUrl.origin}/api/music/scan`, {
            method: 'DELETE',
            headers: {
              'Cookie': `access_token=${request.cookies.get("access_token")?.value}`,
            },
          });
          if (!response.ok) {
            console.warn("Failed to clear scan state after root path change");
          }
        } catch (scanError) {
          console.warn("Failed to clear scan state after root path change:", scanError);
        }
      } catch (cacheError) {
        console.warn(
          "Failed to clear cache after root path change:",
          cacheError
        );
        // Don't fail the request if cache clearing fails
      }
    }

    return NextResponse.json({
      message: "Settings updated successfully",
      cacheCleared: isRootPathChanging,
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    );
  }
}
