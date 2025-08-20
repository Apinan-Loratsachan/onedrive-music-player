import { getRedisClient } from "@/lib/redis";

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

interface MusicCacheEntry {
  files: any[];
  folders: any[];
  lastUpdated: number;
}

interface UserSettings {
  musicRootPath: string;
  driveType?: "personal" | "shared";
  driveId?: string;
  itemId?: string;
  lastUpdated: number;
}

// Key helpers
const keyForScanState = (userId: string) => `user:${userId}:scan-state`;
const keyForScanLock = (userId: string) => `user:${userId}:scan:lock`;
const keyForMusicCache = (userId: string) => `user:${userId}:music-cache`;
const keyForUserSettings = (userId: string) => `user:${userId}:settings`;

// -------- Scan State Management (Redis) --------
export async function setScanState(
  userId: string,
  state: ScanState
): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(keyForScanState(userId), JSON.stringify(state));
}

export async function getScanState(userId: string): Promise<ScanState | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(keyForScanState(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ScanState;
  } catch {
    return null;
  }
}

export async function updateScanState(
  userId: string,
  updates: Partial<ScanState>
): Promise<void> {
  const current = (await getScanState(userId)) || null;
  if (!current) return;
  const merged = { ...current, ...updates } as ScanState;
  await setScanState(userId, merged);
}

// -------- Music Cache Management (Redis Hash) --------
export async function storeMusicData(
  userId: string,
  path: string,
  data: any
): Promise<void> {
  const redis = await getRedisClient();
  const entry: MusicCacheEntry = data;
  await redis.hSet(keyForMusicCache(userId), path, JSON.stringify(entry));
}

export async function getCachedData(
  userId: string,
  path: string
): Promise<any | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.hGet(keyForMusicCache(userId), path);
    return raw ? (JSON.parse(raw) as MusicCacheEntry) : null;
  } catch {
    return null;
  }
}

export async function getLastUpdated(
  userId: string,
  path: string
): Promise<number | null> {
  const data = await getCachedData(userId, path);
  return data?.lastUpdated ?? null;
}

export async function getAllCachedPaths(userId: string): Promise<string[]> {
  try {
    const redis = await getRedisClient();
    const fields = await redis.hKeys(keyForMusicCache(userId));
    return fields ?? [];
  } catch {
    return [];
  }
}

export async function clearCache(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(keyForMusicCache(userId));
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
    const redis = await getRedisClient();
    const values = await redis.hVals(keyForMusicCache(userId));
    let totalFiles = 0;
    let totalFolders = 0;
    let lastUpdated = 0;
    for (const raw of values) {
      try {
        const entry = JSON.parse(raw) as MusicCacheEntry;
        totalFiles += Array.isArray(entry.files) ? entry.files.length : 0;
        totalFolders += Array.isArray(entry.folders) ? entry.folders.length : 0;
        if (
          typeof entry.lastUpdated === "number" &&
          entry.lastUpdated > lastUpdated
        ) {
          lastUpdated = entry.lastUpdated;
        }
      } catch {}
    }
    return {
      totalPaths: values.length,
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

// -------- User-specific scan lock (Redis best-effort) --------
export async function acquireScanLock(userId: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    // 30 minutes expiry to avoid stale locks
    const result = await redis.set(
      keyForScanLock(userId),
      JSON.stringify({ pid: process.pid, ts: Date.now() }),
      { NX: true, EX: 60 * 30 }
    );
    return result === "OK";
  } catch {
    return false;
  }
}

export async function releaseScanLock(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(keyForScanLock(userId));
  } catch {}
}

export async function hasScanLock(userId: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const exists = await redis.exists(keyForScanLock(userId));
    return exists === 1;
  } catch {
    return false;
  }
}

// -------- User Settings (Redis) --------
export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(keyForUserSettings(userId));
    if (raw) return JSON.parse(raw) as UserSettings;
    // default settings when not present
    return {
      musicRootPath: "",
      driveType: "personal",
      driveId: "",
      itemId: "",
      lastUpdated: Date.now(),
    };
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
    const currentSettings = (await getUserSettings(userId)) || {
      musicRootPath: "",
      driveType: "personal",
      driveId: "",
      itemId: "",
      lastUpdated: Date.now(),
    };
    const updated: UserSettings = {
      ...currentSettings,
      ...settings,
      lastUpdated: Date.now(),
    };
    const redis = await getRedisClient();
    await redis.set(keyForUserSettings(userId), JSON.stringify(updated));
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
    const current = await getUserSettings(userId);
    if (!current) throw new Error("No existing settings to update");
    const updated: UserSettings = {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    };
    const redis = await getRedisClient();
    await redis.set(keyForUserSettings(userId), JSON.stringify(updated));
  } catch (error) {
    console.error("Error updating user settings:", error);
    throw error;
  }
}

// -------- Misc Helpers (unchanged) --------
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

export async function getUserIdFromGraphAPI(
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
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
    const redis = await getRedisClient();
    await redis.del(keyForMusicCache(userId));
    await redis.del(keyForScanState(userId));
    await redis.del(keyForScanLock(userId));
  } catch (error) {
    console.error("Error clearing user cache:", error);
  }
}

export async function clearScanState(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(keyForScanState(userId));
    await redis.del(keyForScanLock(userId));
  } catch (error) {
    console.error("Error clearing scan state:", error);
  }
}
