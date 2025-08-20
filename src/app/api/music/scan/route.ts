import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import {
  setScanState,
  getScanState,
  updateScanState,
  storeMusicData,
  getCachedData,
  getLastUpdated,
  getCacheStats,
  acquireScanLock,
  releaseScanLock,
  hasScanLock,
  getUserIdFromGraphAPI,
  getUserSettings,
  clearScanState,
} from "@/lib/storage";
import { getServerAccessToken } from "@/lib/auth";

interface ScanState {
  isScanning: boolean;
  currentPath: string;
  scannedPaths: string[];
  scanedMusicFile?: number; // total audio files counted (cumulative)
  scanedFolder?: number; // total folders processed (cumulative)
  startTime: number;
  lastUpdate: number;
  error?: string;
  // Accurate top-level progress fields
  totalTopLevelFolders: number;
  scannedTopLevelFolders: number;
  topLevelFoldersPaths: string[];
  currentTopLevelFolder?: string;
  // requested key for client progress: number of top-level folders fully scanned
  scaned: number;
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      startBackground = false,
      resumeScan = false,
      forceRestart = false,
    } = body as {
      startBackground?: boolean;
      resumeScan?: boolean;
      forceRestart?: boolean;
    };

    if (startBackground) {
      // If a scan is already running, don't start a new one
      const existing = await getScanState(userId);
      if (existing?.isScanning) {
        return NextResponse.json({
          message: "Scan already in progress",
          status: "scanning",
          scanState: existing,
        });
      }

      // Prevent multiple concurrent starts (process-level lock)
      if (await hasScanLock(userId)) {
        return NextResponse.json({
          message: "Scan lock present; another scan is starting/running",
          status: "locked",
        });
      }

      // If we have previous progress and not forcing restart, resume instead
      if (
        existing &&
        !forceRestart &&
        typeof existing.scannedTopLevelFolders === "number" &&
        typeof existing.totalTopLevelFolders === "number" &&
        existing.scannedTopLevelFolders < existing.totalTopLevelFolders &&
        Array.isArray(existing.topLevelFoldersPaths) &&
        existing.topLevelFoldersPaths.length > 0
      ) {
        existing.isScanning = true;
        existing.lastUpdate = Date.now();
        await setScanState(userId, existing);
        if (await acquireScanLock(userId)) {
          scanTopLevelFolders(accessToken, userId, existing).finally(() =>
            releaseScanLock(userId)
          );
        }
        return NextResponse.json({
          message: "Resuming previous scan",
          status: "scanning",
          scanState: existing,
        });
      }

      // Otherwise, start fresh
      if (await acquireScanLock(userId)) {
        startBackgroundScan(accessToken, userId).finally(() =>
          releaseScanLock(userId)
        );
      }
      return NextResponse.json({
        message: "Background scan started",
        status: "scanning",
      });
    }

    if (resumeScan) {
      // Resume interrupted scan
      const result = await resumeBackgroundScan(accessToken, userId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Error in scan endpoint:", error);
    return NextResponse.json(
      { error: "Failed to process scan request" },
      { status: 500 }
    );
  }
}

async function startBackgroundScan(accessToken: string, userId: string) {
  try {
    // Get user settings for the root path
    const userSettings = await getUserSettings(userId);
    const mainLibraryPath = userSettings?.musicRootPath || ""; // Empty string represents OneDrive root

    // Prime cache for the music library root itself (files and immediate folders)
    const mainChildren = await fetchAllItemsWithPagination(
      accessToken,
      mainLibraryPath
    );
    const mainFolders = mainChildren.filter((item: any) => item.folder);
    const mainFiles = mainChildren.filter((item: any) => item.file);

    // Cache root path listing
    const rootAudioFiles = mainFiles.filter((item: any) => {
      const extension = item.name?.split(".").pop()?.toLowerCase();
      return ["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(extension);
    });
    const processedRootFiles = rootAudioFiles.map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      path: mainLibraryPath,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: mainLibraryPath.split("/").pop() || "Unknown",
      extension: file.name.split(".").pop()?.toUpperCase() || "",
      lastModified: file.lastModifiedDateTime || new Date().toISOString(),
    }));
    await storeMusicData(userId, mainLibraryPath, {
      files: processedRootFiles,
      folders: mainFolders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        path: mainLibraryPath,
        folder: folder.folder,
      })),
      lastUpdated: Date.now(),
    });

    // Prepare top-level folder list
    const topLevelFoldersPaths = mainFolders.map(
      (f: any) => `${mainLibraryPath}/${f.name}`
    );

    const scanState: ScanState = {
      isScanning: true,
      currentPath: mainLibraryPath,
      scannedPaths: [],
      startTime: Date.now(),
      lastUpdate: Date.now(),
      totalTopLevelFolders: topLevelFoldersPaths.length,
      scannedTopLevelFolders: 0,
      topLevelFoldersPaths,
      currentTopLevelFolder: topLevelFoldersPaths[0] || undefined,
      scaned: 0,
      scanedMusicFile: 0,
      scanedFolder: 0,
    };

    await setScanState(userId, scanState);

    // Start scanning each top-level folder fully (including its subfolders)
    await scanTopLevelFolders(accessToken, userId, scanState);
  } catch (error) {
    console.error("Error starting background scan:", error);
    await updateScanState(userId, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function scanTopLevelFolders(
  accessToken: string,
  userId: string,
  scanState: ScanState
) {
  try {
    // Always load the latest persisted state to avoid clobbering progress
    let freshState = (await getScanState(userId)) || scanState;
    const { topLevelFoldersPaths, scannedTopLevelFolders } = freshState;
    for (
      let index = scannedTopLevelFolders;
      index < topLevelFoldersPaths.length && scanState.isScanning;
      index++
    ) {
      const topLevelPath = topLevelFoldersPaths[index];
      // Reload latest state to avoid overwriting cumulative counters
      const preState = (await getScanState(userId)) || freshState;
      // Update fields prior to scanning the folder
      preState.currentTopLevelFolder = topLevelPath;
      preState.currentPath = topLevelPath; // reflect the exact folder being scanned
      preState.lastUpdate = Date.now();
      console.log(`[SCAN] ${userId} | ${topLevelPath}`);
      await setScanState(userId, preState);

      let scannedOk = false;
      try {
        await scanFolderRecursive(
          accessToken,
          userId,
          topLevelPath,
          freshState
        );
        scannedOk = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If unauthorized during scan, refresh token once and retry this folder before resuming
        if (msg.includes("401")) {
          try {
            const refreshed = await getServerAccessToken();
            if (refreshed) {
              await scanFolderRecursive(
                refreshed,
                userId,
                topLevelPath,
                freshState
              );
              scannedOk = true;
            }
          } catch (retryErr) {
            console.error(
              `Retry after token refresh failed for ${topLevelPath}:`,
              retryErr
            );
          }
        }
        if (!scannedOk) {
          console.error(
            `Error scanning top-level folder ${topLevelPath}:`,
            err
          );
        }
      }

      // After completing an entire top-level folder
      const postState = (await getScanState(userId)) || preState;
      postState.scannedTopLevelFolders = index + 1;
      // mirror to requested key
      postState.scaned = postState.scannedTopLevelFolders;
      postState.lastUpdate = Date.now();
      await setScanState(userId, postState);
      // keep latest reference for next loop
      freshState = postState;

      // Small delay to avoid hammering API between folders
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Mark scan as complete (preserve cumulative counters)
    const doneState = (await getScanState(userId)) || freshState;
    doneState.isScanning = false;
    doneState.lastUpdate = Date.now();
    await setScanState(userId, doneState);
  } catch (error) {
    console.error("Error in scanAllFolders:", error);
    await updateScanState(userId, {
      error: error instanceof Error ? error.message : String(error),
      isScanning: false,
    });
  }
}

async function scanFolderRecursive(
  accessToken: string,
  userId: string,
  folderPath: string,
  scanState: ScanState
) {
  const queue: string[] = [folderPath];
  const visited = new Set<string>();

  while (queue.length > 0 && scanState.isScanning) {
    const currentPath = queue.shift()!;
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    // Update currentPath to the folder we are about to process
    try {
      await updateScanState(userId, { currentPath });
    } catch {}

    const allItems = await fetchAllItemsWithPagination(
      accessToken,
      currentPath
    );
    const folders = allItems.filter((item: any) => item.folder);
    const files = allItems.filter((item: any) => item.file);

    const audioFiles = files.filter((item: any) => {
      const extension = item.name?.split(".").pop()?.toLowerCase();
      return ["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(extension);
    });

    const processedFiles = audioFiles.map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      path: currentPath,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: currentPath.split("/").pop() || "Unknown",
      extension: file.name.split(".").pop()?.toUpperCase() || "",
      lastModified: file.lastModifiedDateTime || new Date().toISOString(),
    }));

    await storeMusicData(userId, currentPath, {
      files: processedFiles,
      folders: folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        path: currentPath,
        folder: folder.folder,
      })),
      lastUpdated: Date.now(),
    });

    folders.forEach((folder: any) => {
      const subPath = `${currentPath}/${folder.name}`;
      if (!visited.has(subPath)) {
        queue.push(subPath);
      }
    });

    // Update incidental scan stats/info, re-read persisted state to avoid loss
    const latest = (await getScanState(userId)) || scanState;
    latest.scannedPaths = Array.from(
      new Set([...latest.scannedPaths, currentPath])
    );
    latest.scanedMusicFile =
      (latest.scanedMusicFile || 0) + processedFiles.length;
    latest.scanedFolder = (latest.scanedFolder || 0) + 1;
    latest.currentPath = currentPath;
    latest.lastUpdate = Date.now();
    await setScanState(userId, latest);

    // Throttle a bit inside recursion
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
}

async function fetchAllItemsWithPagination(
  accessToken: string,
  path: string
): Promise<any[]> {
  const allItems: any[] = [];

  // Build the correct API URL based on whether we're at root or in a subfolder
  let currentUrl: string;
  if (path === "") {
    // For OneDrive root, use the root children endpoint
    currentUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children`;
  } else {
    // For subfolders, use the path-based endpoint
    const encodedPath = encodeURIComponent(path);
    currentUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/children`;
  }

  let currentToken = accessToken;
  while (currentUrl) {
    let response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
    });

    // If unauthorized, try to refresh access token once and retry this URL
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
      throw new Error(
        `Graph API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    allItems.push(...data.value);

    // Check if there are more pages
    currentUrl = data["@odata.nextLink"] || null;
  }

  return allItems;
}

async function resumeBackgroundScan(accessToken: string, userId: string) {
  const scanState = await getScanState(userId);

  if (!scanState || !scanState.isScanning) {
    return { message: "No active scan to resume" };
  }

  // Resume from where we left off
  if (await acquireScanLock(userId)) {
    scanTopLevelFolders(accessToken, userId, scanState).finally(() =>
      releaseScanLock(userId)
    );
  }

  return {
    message: "Scan resumed",
    status: "resumed",
    scanState,
  };
}

// Add cache stats endpoint
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

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");
    const stats = searchParams.get("stats");

    if (stats === "true") {
      // Return cache statistics
      const cacheStats = await getCacheStats(userId);
      return NextResponse.json(cacheStats);
    }

    if (path) {
      // Check if specific path is cached
      const cachedData = await getCachedData(userId, path);
      if (cachedData) {
        return NextResponse.json({
          cached: true,
          data: cachedData,
          lastUpdated: await getLastUpdated(userId, path),
        });
      }
    }

    // Return scan status
    const scanState = await getScanState(userId);
    return NextResponse.json({
      cached: false,
      scanState,
    });
  } catch (error) {
    console.error("Error getting scan data:", error);
    return NextResponse.json(
      { error: "Failed to get scan data" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    await clearScanState(userId);
    return NextResponse.json({ message: "Scan state cleared" });
  } catch (error) {
    console.error("Error clearing scan state:", error);
    return NextResponse.json(
      { error: "Failed to clear scan state" },
      { status: 500 }
    );
  }
}
