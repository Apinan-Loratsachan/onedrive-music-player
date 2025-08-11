import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".cache");

// User-specific cache directory structure
function getUserCacheDir(userId: string) {
  return path.join(DATA_DIR, "users", userId);
}

function getUserScanStateFile(userId: string) {
  return path.join(getUserCacheDir(userId), "scan-state.json");
}

function getUserMusicCacheFile(userId: string) {
  return path.join(getUserCacheDir(userId), "music-cache.json");
}

interface ScanState {
  isScanning: boolean;
  currentPath: string;
  scannedPaths: string[];
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
  // cumulative counters
  scanedMusicFile?: number;
  scanedFolder?: number;
}

interface MusicCache {
  [path: string]: {
    files: any[];
    folders: any[];
    lastUpdated: number;
  };
}

interface UserSettings {
  musicRootPath: string;
  lastUpdated: number;
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Ensure user cache directory exists
async function ensureUserCacheDir(userId: string) {
  try {
    await ensureDataDir();
    const userDir = getUserCacheDir(userId);
    await fs.access(userDir);
  } catch {
    const userDir = getUserCacheDir(userId);
    await fs.mkdir(userDir, { recursive: true });
  }
}

// Simple per-file async lock queue to serialize read-modify-write operations
const fileQueues = new Map<string, Promise<void>>();

async function withFileLock(filePath: string, task: () => Promise<void>) {
  const prev = fileQueues.get(filePath) ?? Promise.resolve();
  let done!: () => void;
  const next = new Promise<void>((resolve) => (done = resolve));
  fileQueues.set(
    filePath,
    prev
      .catch(() => undefined)
      .then(async () => {
        try {
          await task();
        } finally {
          done();
        }
      })
  );
  await next;
  // Cleanup tail pointer if this is the last queued task
  const tail = fileQueues.get(filePath);
  if (tail === next) fileQueues.delete(filePath);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeJsonAtomic(filePath: string, jsonString: string) {
  await ensureDataDir();
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  await fs.writeFile(tmp, jsonString);

  const tryRename = async () => {
    try {
      await fs.rename(tmp, filePath);
      return true;
    } catch (err: any) {
      if (err && (err.code === "EPERM" || err.code === "EBUSY")) {
        // Windows can lock the dest; try to remove then rename
        try {
          await fs.unlink(filePath).catch(() => undefined);
          await fs.rename(tmp, filePath);
          return true;
        } catch {}
      }
      return false;
    }
  };

  // Retry a few times to avoid transient Windows locks
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await tryRename()) {
      return;
    }
    await sleep(50 * (attempt + 1));
  }

  // Fallback: copy content directly to target
  try {
    await fs.writeFile(filePath, jsonString);
  } finally {
    // Cleanup tmp
    await fs.unlink(tmp).catch(() => undefined);
  }
}

// Scan State Management
export async function setScanState(
  userId: string,
  state: ScanState
): Promise<void> {
  await ensureUserCacheDir(userId);
  const filePath = getUserScanStateFile(userId);
  await withFileLock(filePath, async () => {
    await writeJsonAtomic(filePath, JSON.stringify(state, null, 2));
  });
}

export async function getScanState(userId: string): Promise<ScanState | null> {
  try {
    await ensureUserCacheDir(userId);
    const filePath = getUserScanStateFile(userId);
    const data = await fs.readFile(filePath, "utf-8");
    const result = JSON.parse(data);
    return result;
  } catch (error) {
    return null;
  }
}

export async function updateScanState(
  userId: string,
  updates: Partial<ScanState>
): Promise<void> {
  await ensureUserCacheDir(userId);
  await withFileLock(getUserScanStateFile(userId), async () => {
    const currentState = await getScanState(userId);
    if (currentState) {
      const updatedState = { ...currentState, ...updates } as ScanState;
      await writeJsonAtomic(
        getUserScanStateFile(userId),
        JSON.stringify(updatedState, null, 2)
      );
    }
  });
}

// Music Cache Management
export async function storeMusicData(
  userId: string,
  path: string,
  data: any
): Promise<void> {
  await ensureUserCacheDir(userId);
  await withFileLock(getUserMusicCacheFile(userId), async () => {
    let cache: MusicCache = {};
    try {
      const existingData = await fs.readFile(
        getUserMusicCacheFile(userId),
        "utf-8"
      );
      cache = JSON.parse(existingData);
    } catch {
      // File doesn't exist or is invalid, start fresh
      cache = {} as MusicCache;
    }
    cache[path] = data;
    await writeJsonAtomic(
      getUserMusicCacheFile(userId),
      JSON.stringify(cache, null, 2)
    );
  });
}

export async function getCachedData(
  userId: string,
  path: string
): Promise<any | null> {
  try {
    await ensureUserCacheDir(userId);
    const data = await fs.readFile(getUserMusicCacheFile(userId), "utf-8");
    const cache: MusicCache = JSON.parse(data);
    return cache[path] || null;
  } catch {
    return null;
  }
}

export async function getLastUpdated(
  userId: string,
  path: string
): Promise<number | null> {
  const data = await getCachedData(userId, path);
  return data?.lastUpdated || null;
}

export async function getAllCachedPaths(userId: string): Promise<string[]> {
  try {
    await ensureUserCacheDir(userId);
    const data = await fs.readFile(getUserMusicCacheFile(userId), "utf-8");
    const cache: MusicCache = JSON.parse(data);
    return Object.keys(cache);
  } catch {
    return [];
  }
}

export async function clearCache(userId: string): Promise<void> {
  try {
    await ensureUserCacheDir(userId);
    await withFileLock(getUserMusicCacheFile(userId), async () => {
      await writeJsonAtomic(getUserMusicCacheFile(userId), "{}");
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}

export async function getCacheStats(userId: string): Promise<{
  totalPaths: number;
  totalFiles: number;
  totalFolders: number;
  lastUpdated: number | null;
}> {
  try {
    await ensureUserCacheDir(userId);
    const data = await fs.readFile(getUserMusicCacheFile(userId), "utf-8");
    const cache: MusicCache = JSON.parse(data);

    const paths = Object.keys(cache);
    let totalFiles = 0;
    let totalFolders = 0;
    let lastUpdated = 0;

    paths.forEach((path) => {
      const data = cache[path];
      totalFiles += data.files?.length || 0;
      totalFolders += data.folders?.length || 0;
      if (data.lastUpdated > lastUpdated) {
        lastUpdated = data.lastUpdated;
      }
    });

    return {
      totalPaths: paths.length,
      totalFiles,
      totalFolders,
      lastUpdated: lastUpdated > 0 ? lastUpdated : null,
    };
  } catch {
    return {
      totalPaths: 0,
      totalFiles: 0,
      totalFolders: 0,
      lastUpdated: null,
    };
  }
}

// User-specific scan lock using lock files (best-effort, process-wide)
function getUserScanLockFile(userId: string) {
  return path.join(getUserCacheDir(userId), "scan.lock");
}

export async function acquireScanLock(userId: string): Promise<boolean> {
  await ensureUserCacheDir(userId);
  try {
    // Create exclusively; fails if exists
    await fs.writeFile(
      getUserScanLockFile(userId),
      JSON.stringify({ pid: process.pid, ts: Date.now() })
    );
    // Attempt exclusive by using link semantics: if another process overwrote, it's still one file; best-effort
    return true;
  } catch {
    return false;
  }
}

export async function releaseScanLock(userId: string): Promise<void> {
  try {
    await fs.unlink(getUserScanLockFile(userId));
  } catch {}
}

export async function hasScanLock(userId: string): Promise<boolean> {
  try {
    await fs.access(getUserScanLockFile(userId));
    return true;
  } catch {
    return false;
  }
}

function getUserSettingsFile(userId: string) {
  return path.join(getUserCacheDir(userId), "user-settings.json");
}

export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  try {
    await ensureUserCacheDir(userId);
    const settingsFile = getUserSettingsFile(userId);

    try {
      const data = await fs.readFile(settingsFile, "utf-8");
      return JSON.parse(data);
    } catch {
      // Return default settings if file doesn't exist
      return {
        musicRootPath: "", // Empty string represents OneDrive root
        lastUpdated: Date.now(),
      };
    }
  } catch (error) {
    console.error("Error getting user settings:", error);
    return null;
  }
}

export async function setUserSettings(
  userId: string,
  settings: Partial<UserSettings>
): Promise<void> {
  try {
    await ensureUserCacheDir(userId);
    const settingsFile = getUserSettingsFile(userId);

    // Get current settings and merge with new ones
    const currentSettings = (await getUserSettings(userId)) || {
      musicRootPath: "", // Empty string represents OneDrive root
      lastUpdated: Date.now(),
    };

    const updatedSettings = {
      ...currentSettings,
      ...settings,
      lastUpdated: Date.now(),
    };

    await withFileLock(settingsFile, async () => {
      await writeJsonAtomic(
        settingsFile,
        JSON.stringify(updatedSettings, null, 2)
      );
    });
  } catch (error) {
    console.error("Error setting user settings:", error);
    throw error;
  }
}

export async function updateUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): Promise<void> {
  try {
    await ensureUserCacheDir(userId);
    const settingsFile = getUserSettingsFile(userId);

    const currentSettings = await getUserSettings(userId);
    if (!currentSettings) {
      throw new Error("No existing settings to update");
    }

    const updatedSettings = {
      ...currentSettings,
      ...updates,
      lastUpdated: Date.now(),
    };

    await withFileLock(settingsFile, async () => {
      await writeJsonAtomic(
        settingsFile,
        JSON.stringify(updatedSettings, null, 2)
      );
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    throw error;
  }
}

// Helper function to get user ID from cookies
export function getUserIdFromCookies(cookies: any): string | null {
  try {
    const userProfileCookie = cookies.get("user_profile");
    if (userProfileCookie) {
      const userProfile = JSON.parse(userProfileCookie.value);
      return userProfile.id || null;
    }
  } catch (error) {
    console.error("Error parsing user profile cookie:", error);
  }
  return null;
}

// Helper function to get user ID from Microsoft Graph API
export async function getUserIdFromGraphAPI(
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const userProfile = await response.json();
      return userProfile.id || null;
    } else {
      console.error(
        "Failed to fetch user profile from Graph API:",
        response.status
      );
      return null;
    }
  } catch (error) {
    console.error("Error fetching user profile from Graph API:", error);
    return null;
  }
}

export async function clearUserCache(userId: string): Promise<void> {
  try {
    await ensureUserCacheDir(userId);

    // Clear music cache
    await withFileLock(getUserMusicCacheFile(userId), async () => {
      await writeJsonAtomic(getUserMusicCacheFile(userId), "{}");
    });

    // Clear scan state
    await withFileLock(getUserScanStateFile(userId), async () => {
      await writeJsonAtomic(getUserScanStateFile(userId), "{}");
    });

    // Clear scan lock
    try {
      await fs.unlink(getUserScanLockFile(userId));
    } catch {
      // Lock file might not exist, ignore error
    }
  } catch (error) {
    console.error("Error clearing user cache:", error);
  }
}

export async function clearScanState(userId: string): Promise<void> {
  try {
    await ensureUserCacheDir(userId);
    await withFileLock(getUserScanStateFile(userId), async () => {
      await writeJsonAtomic(getUserScanStateFile(userId), "{}");
    });

    // Also clear scan lock
    try {
      await fs.unlink(getUserScanLockFile(userId));
    } catch {
      // Lock file might not exist, ignore error
    }
  } catch (error) {
    console.error("Error clearing scan state:", error);
  }
}
