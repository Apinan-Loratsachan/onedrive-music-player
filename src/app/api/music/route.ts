import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import { getUserSettings, getUserIdFromGraphAPI } from "@/lib/storage";
import { getServerAccessToken } from "@/lib/auth";

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

    // Get user settings for the root path
    const userSettings = await getUserSettings(userId);
    const defaultRootPath = userSettings?.musicRootPath || ""; // Empty string represents OneDrive root
    const defaultDriveType = userSettings?.driveType || "personal";
    const defaultDriveId = userSettings?.driveId || "";
    const defaultItemId = userSettings?.itemId || "";

    // Get the path parameter from the query string
    const { searchParams } = new URL(request.url);
    let path = searchParams.get("path") || defaultRootPath;
    const driveType = searchParams.get("driveType") || defaultDriveType; // "personal" or "shared"
    const driveId = searchParams.get("driveId") || defaultDriveId;
    const itemId = searchParams.get("itemId") || defaultItemId;

    // Normalize path to support variants like "/" for personal root
    if (driveType === "personal") {
      if (path === "/") path = "";
      if (path.startsWith("/")) path = path.replace(/^\/+/, "");
    } else {
      // For shared, default to "shared" when unset or "/"
      if (!path || path === "/") path = "shared";
    }

    // First, try to get data from cache
    try {
      const cacheResponse = await fetch(
        `${request.nextUrl.origin}/api/music/scan?path=${encodeURIComponent(
          path
        )}`
      );
      if (cacheResponse.ok) {
        const cachedData = await cacheResponse.json();
        if (cachedData.cached) {
          console.log(`Returning cached data for path: ${path}`);
          return NextResponse.json({
            files: cachedData.data.files || [],
            folders: cachedData.data.folders || [],
            currentPath: path,
            cached: true,
            lastUpdated: cachedData.lastUpdated,
          });
        }
      }
    } catch (cacheError) {
      console.log("Cache not available, falling back to direct API call");
    }

    // If no cache, trigger a background scan and return current data
    try {
      fetch(`${request.nextUrl.origin}/api/music/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startBackground: true }),
      }).catch((err) => console.log("Background scan failed:", err));
    } catch (scanError) {
      console.log("Could not trigger background scan");
    }

    // Fallback to direct API call
    console.log(`Fetching data directly for path: ${path}`);

    // Encode the path for the API call
    const encodedPath = encodeURIComponent(path);

    // Function to fetch all items with pagination
    const fetchAllItems = async (url: string): Promise<any[]> => {
      const allItems: any[] = [];
      let currentUrl = url;
      let currentToken = accessToken;

      while (currentUrl) {
        let response = await fetch(currentUrl, {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.status === 401) {
          try {
            const refreshed = await getServerAccessToken();
            if (refreshed) {
              currentToken = refreshed;
              response = await fetch(currentUrl, {
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  "Content-Type": "application/json",
                },
              });
            }
          } catch {}
        }

        if (!response.ok) {
          if (response.status === 404) {
            // Path not found - return empty results instead of throwing error
            console.log(`Path not found: ${path}`);
            return [];
          }
          const errorText = await response.text();
          console.error("Graph API error response:", errorText);
          throw new Error(
            `Graph API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json();
        allItems.push(...data.value);

        // Check if there are more pages
        currentUrl = data["@odata.nextLink"] || null;
      }

      return allItems;
    };

    // Build the correct API URL based on drive type and path
    let apiUrl: string;
    if (driveType === "shared") {
      if (path === "shared") {
        // For shared drive root, use the sharedWithMe endpoint
        apiUrl = "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe";
      } else if (driveId && itemId) {
        // For shared drive subfolders, use the drive-specific endpoint
        apiUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children`;
      } else {
        // Fallback to path-based navigation for shared drives
        const encodedPath = encodeURIComponent(path);
        apiUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children`;
      }
    } else {
      // Personal drive logic
      if (path === "") {
        // For OneDrive root, use the root children endpoint
        apiUrl = "https://graph.microsoft.com/v1.0/me/drive/root/children";
      } else {
        // For subfolders, use the path-based endpoint
        const encodedPath = encodeURIComponent(path);
        apiUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children`;
      }
    }

    // Fetch all children from OneDrive using the children endpoint with pagination
    const allItems = await fetchAllItems(apiUrl);

    console.log(`Fetched ${allItems.length} total items from path: ${path}`);

    // Check if the path was not found (empty result from 404)
    const pathNotFound =
      allItems.length === 0 && path !== "" && path !== "shared";

    // Separate folders and files
    const folders = allItems.filter((item: any) => item.folder);
    const files = allItems.filter((item: any) => item.file);

    console.log(`Found ${folders.length} folders and ${files.length} files`);

    // Filter for audio files
    const audioFiles = files.filter((item: any) => {
      const extension = item.name?.split(".").pop()?.toLowerCase();
      return ["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(extension);
    });

    // Enhance files with metadata
    const enhancedFiles = await Promise.all(
      audioFiles.map(async (file: any) => {
        try {
          // Get file metadata from OneDrive
          let metadataResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (metadataResponse.status === 401) {
            const refreshed = await getServerAccessToken();
            if (refreshed) {
              metadataResponse = await fetch(
                `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference`,
                {
                  headers: {
                    Authorization: `Bearer ${refreshed}`,
                    "Content-Type": "application/json",
                  },
                }
              );
            }
          }

          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();

            // Extract folder path for better organization
            const folderPath =
              metadata.parentReference?.path?.split("/").pop() || "Unknown";

            return {
              ...file,
              folder: folderPath,
              // For now, use filename as title (you can enhance this later with ID3 parsing)
              title: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
              artist: folderPath, // Use folder name as artist for now
              lastModified: metadata.lastModifiedDateTime,
            };
          }

          return file;
        } catch (error) {
          console.error(`Error fetching metadata for ${file.name}:`, error);
          return file;
        }
      })
    );

    return NextResponse.json({
      files: enhancedFiles,
      folders: folders,
      currentPath: path,
      pathNotFound: pathNotFound,
      driveType: driveType,
      driveId: driveId,
      itemId: itemId,
    });
  } catch (error) {
    console.error("Error fetching music files:", error);
    return NextResponse.json(
      { error: "Failed to fetch music files" },
      { status: 500 }
    );
  }
}
