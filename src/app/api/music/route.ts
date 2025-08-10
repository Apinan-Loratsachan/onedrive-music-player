import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    // Get the path parameter from the query string
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path") || "Music/Music Library/Main Library";

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

      while (currentUrl) {
        const response = await fetch(currentUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
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

    // Fetch all children from OneDrive using the children endpoint with pagination
    const allItems = await fetchAllItems(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children`
    );

    console.log(`Fetched ${allItems.length} total items from path: ${path}`);

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
          const metadataResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

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
    });
  } catch (error) {
    console.error("Error fetching music files:", error);
    return NextResponse.json(
      { error: "Failed to fetch music files" },
      { status: 500 }
    );
  }
}
