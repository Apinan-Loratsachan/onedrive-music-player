import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromGraphAPI, getAllCachedPathEntries } from "@/lib/storage";
import { getServerAccessToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getServerAccessToken();

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

    // Pagination parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");
    const limit = Math.min(Math.max(Number(limitParam) || 300, 50), 1000);

    // Preload entries to avoid N round-trips
    const entries = await getAllCachedPathEntries(userId);
    const totalPaths = entries.length;

    // Build flattened, de-duplicated tracks once per request
    const idToTrack = new Map<string, any>();
    for (const { path: p, entry } of entries) {
      const files = Array.isArray(entry?.files) ? entry.files : [];
      for (const file of files) {
        if (file && typeof file.id === "string") {
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

    const allTracks = Array.from(idToTrack.values());
    // stable sort for deterministic cursoring
    allTracks.sort((a, b) => {
      const aArtist = (a.artist || "").toLowerCase();
      const bArtist = (b.artist || "").toLowerCase();
      if (aArtist !== bArtist) return aArtist.localeCompare(bArtist);
      const aTitle = (a.title || a.name || "").toLowerCase();
      const bTitle = (b.title || b.name || "").toLowerCase();
      return aTitle.localeCompare(bTitle);
    });

    // Cursor is a numeric offset into the sorted list
    const offset = Math.max(Number(cursorParam) || 0, 0);
    const slice = allTracks.slice(offset, offset + limit);
    const nextCursor =
      offset + slice.length < allTracks.length ? offset + slice.length : null;

    return NextResponse.json({
      tracks: slice,
      total: allTracks.length,
      cachedPaths: totalPaths,
      nextCursor,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error reading cache:", error);
    return NextResponse.json(
      { error: "Failed to read cached tracks" },
      { status: 500 }
    );
  }
}
