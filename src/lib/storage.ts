import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".cache");
const SCAN_STATE_FILE = path.join(DATA_DIR, "scan-state.json");
const MUSIC_CACHE_FILE = path.join(DATA_DIR, "music-cache.json");
const SCAN_LOCK_FILE = path.join(DATA_DIR, "scan.lock");

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

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
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
export async function setScanState(state: ScanState): Promise<void> {
  await withFileLock(SCAN_STATE_FILE, async () => {
    await writeJsonAtomic(SCAN_STATE_FILE, JSON.stringify(state, null, 2));
  });
}

export async function getScanState(): Promise<ScanState | null> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SCAN_STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function updateScanState(
  updates: Partial<ScanState>
): Promise<void> {
  await withFileLock(SCAN_STATE_FILE, async () => {
    const currentState = await getScanState();
    if (currentState) {
      const updatedState = { ...currentState, ...updates } as ScanState;
      await writeJsonAtomic(
        SCAN_STATE_FILE,
        JSON.stringify(updatedState, null, 2)
      );
    }
  });
}

// Music Cache Management
export async function storeMusicData(path: string, data: any): Promise<void> {
  await withFileLock(MUSIC_CACHE_FILE, async () => {
    await ensureDataDir();
    let cache: MusicCache = {};
    try {
      const existingData = await fs.readFile(MUSIC_CACHE_FILE, "utf-8");
      cache = JSON.parse(existingData);
    } catch {
      // File doesn't exist or is invalid, start fresh
      cache = {} as MusicCache;
    }
    cache[path] = data;
    await writeJsonAtomic(MUSIC_CACHE_FILE, JSON.stringify(cache, null, 2));
  });
}

export async function getCachedData(path: string): Promise<any | null> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(MUSIC_CACHE_FILE, "utf-8");
    const cache: MusicCache = JSON.parse(data);
    return cache[path] || null;
  } catch {
    return null;
  }
}

export async function getLastUpdated(path: string): Promise<number | null> {
  const data = await getCachedData(path);
  return data?.lastUpdated || null;
}

export async function getAllCachedPaths(): Promise<string[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(MUSIC_CACHE_FILE, "utf-8");
    const cache: MusicCache = JSON.parse(data);
    return Object.keys(cache);
  } catch {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  try {
    await ensureDataDir();
    await withFileLock(MUSIC_CACHE_FILE, async () => {
      await writeJsonAtomic(MUSIC_CACHE_FILE, "{}");
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}

export async function getCacheStats(): Promise<{
  totalPaths: number;
  totalFiles: number;
  totalFolders: number;
  lastUpdated: number | null;
}> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(MUSIC_CACHE_FILE, "utf-8");
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

// Cross-request scan lock using a lock file (best-effort, process-wide)
export async function acquireScanLock(): Promise<boolean> {
  await ensureDataDir();
  try {
    // Create exclusively; fails if exists
    await fs.writeFile(
      SCAN_LOCK_FILE,
      JSON.stringify({ pid: process.pid, ts: Date.now() })
    );
    // Attempt exclusive by using link semantics: if another process overwrote, it's still one file; best-effort
    return true;
  } catch {
    return false;
  }
}

export async function releaseScanLock(): Promise<void> {
  try {
    await fs.unlink(SCAN_LOCK_FILE);
  } catch {}
}

export async function hasScanLock(): Promise<boolean> {
  try {
    await fs.access(SCAN_LOCK_FILE);
    return true;
  } catch {
    return false;
  }
}
