import { NextRequest, NextResponse } from "next/server";
import {
  getAllCachedPaths,
  getCachedData,
  getUserIdFromGraphAPI,
} from "@/lib/storage";

export const runtime = "nodejs";

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

    const paths = await getAllCachedPaths(userId);
    const idToTrack = new Map<string, any>();

    for (const p of paths) {
      const data = await getCachedData(userId, p);
      const files = Array.isArray(data?.files) ? data.files : [];
      for (const file of files) {
        if (file && typeof file.id === "string") {
          // Prefer first occurrence; avoid duplicates across paths
          if (!idToTrack.has(file.id)) {
            idToTrack.set(file.id, {
              id: file.id,
              name: file.name,
              size: file.size,
              title: file.title ?? file.name?.replace(/\.[^/.]+$/, ""),
              artist: file.artist ?? p.split("/").pop() ?? "Unknown",
              folder: file.path ?? p,
              lastModified: file.lastModified,
              extension: file.extension,
            });
          }
        }
      }
    }

    const tracks = Array.from(idToTrack.values());

    // Sort by artist then title for a stable list
    tracks.sort((a, b) => {
      const aArtist = (a.artist || "").toLowerCase();
      const bArtist = (b.artist || "").toLowerCase();
      if (aArtist !== bArtist) return aArtist.localeCompare(bArtist);
      const aTitle = (a.title || a.name || "").toLowerCase();
      const bTitle = (b.title || b.name || "").toLowerCase();
      return aTitle.localeCompare(bTitle);
    });

    return NextResponse.json({
      tracks,
      total: tracks.length,
      cachedPaths: paths.length,
    });
  } catch (error) {
    console.error("Error reading cache:", error);
    return NextResponse.json(
      { error: "Failed to read cached tracks" },
      { status: 500 }
    );
  }
}
