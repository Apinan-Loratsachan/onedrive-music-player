"use client";

import { useState, useEffect } from "react";
import { Play, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Progress,
  Chip,
  Spinner,
  Accordion,
  AccordionItem,
} from "@heroui/react";

interface ScanState {
  isScanning: boolean;
  currentPath: string;
  scannedPaths: string[];
  totalItems: number;
  scannedItems: number;
  startTime: number;
  lastUpdate: number;
  error?: string;
  totalTopLevelFolders?: number;
  scannedTopLevelFolders?: number;
  topLevelFoldersPaths?: string[];
  currentTopLevelFolder?: string;
  scaned?: number;
  scanedMusicFile?: number;
  scanedFolder?: number;
}

export default function ScanManager() {
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Normalize incoming scan state payloads to ensure required defaults
  const normalizeScanState = (input: any): ScanState => {
    return {
      isScanning: !!input?.isScanning,
      currentPath: input?.currentPath || "",
      scannedPaths: Array.isArray(input?.scannedPaths)
        ? input.scannedPaths
        : [],
      totalItems: typeof input?.totalItems === "number" ? input.totalItems : 0,
      scannedItems:
        typeof input?.scannedItems === "number" ? input.scannedItems : 0,
      startTime:
        typeof input?.startTime === "number" ? input.startTime : Date.now(),
      lastUpdate:
        typeof input?.lastUpdate === "number" ? input.lastUpdate : Date.now(),
      error: input?.error,
      totalTopLevelFolders:
        typeof input?.totalTopLevelFolders === "number"
          ? input.totalTopLevelFolders
          : 0,
      scannedTopLevelFolders:
        typeof input?.scannedTopLevelFolders === "number"
          ? input.scannedTopLevelFolders
          : 0,
      topLevelFoldersPaths: Array.isArray(input?.topLevelFoldersPaths)
        ? input.topLevelFoldersPaths
        : [],
      currentTopLevelFolder: input?.currentTopLevelFolder || "",
      scaned:
        typeof input?.scaned === "number"
          ? input.scaned
          : typeof input?.scannedTopLevelFolders === "number"
          ? input.scannedTopLevelFolders
          : 0,
      scanedMusicFile:
        typeof input?.scanedMusicFile === "number" ? input.scanedMusicFile : 0,
      scanedFolder:
        typeof input?.scanedFolder === "number" ? input.scanedFolder : 0,
    };
  };

  // Function to reset scan state (can be called externally)
  const resetScanState = () => {
    setScanState(null);
    setIsStarting(false);
    setLastChecked(null);
  };

  // Expose reset function to parent components
  useEffect(() => {
    // @ts-ignore - Exposing function to parent
    window.resetScanManager = resetScanState;

    return () => {
      // @ts-ignore - Cleanup
      delete window.resetScanManager;
    };
  }, []);

  // Derived flags for UI decisions
  const hasPartialProgress = !!(
    scanState &&
    typeof scanState.scannedTopLevelFolders === "number" &&
    typeof scanState.totalTopLevelFolders === "number" &&
    scanState.totalTopLevelFolders > 0 &&
    scanState.scannedTopLevelFolders < scanState.totalTopLevelFolders
  );
  const isStalled = !!(
    scanState?.isScanning &&
    scanState?.lastUpdate &&
    Date.now() - scanState.lastUpdate > 30_000
  );
  const canResume = hasPartialProgress && (!scanState?.isScanning || isStalled);

  const getCurrentSubfolderPath = (): string => {
    if (!scanState) return "";
    const current = scanState.currentPath || "";
    const top = scanState.currentTopLevelFolder || "";
    if (!current) return "";
    if (top && current.startsWith(top)) {
      const topName = top.split("/").pop() || top;
      const rel = current.slice(top.length).replace(/^\/+/, "");
      return rel ? `${topName}/${rel}` : topName;
    }
    // Fallback: show tail of current path
    const tail = current.split("/").slice(-3).join("/");
    return tail;
  };

  useEffect(() => {
    // Initial fetch in case SSE is delayed
    checkScanStatus();

    // Get userId using access token from Microsoft API
    const getUserId = async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (response.ok) {
          const userProfile = await response.json();
          return userProfile.id;
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
      return null;
    };

    // Use async function to get userId and set up SSE
    const setupSSE = async () => {
      const userId = await getUserId();
      if (!userId) {
        console.warn("No user ID found, falling back to polling");
        return;
      }

      const eventSource = new EventSource(
        `/api/music/scan/stream?userId=${encodeURIComponent(userId)}`
      );
      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload?.scanState) {
            setScanState(normalizeScanState(payload.scanState));
            setLastChecked(new Date());
          }
        } catch {}
      };
      eventSource.onerror = () => {
        // Fallback to periodic polling if SSE fails
        checkScanStatus();
      };

      return eventSource;
    };

    let eventSource: EventSource | null = null;
    setupSSE().then((es) => {
      if (es) {
        eventSource = es;
      }
    });

    return () => {
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
    };
  }, []);

  const checkScanStatus = async () => {
    try {
      const response = await fetch("/api/music/scan");
      if (response.ok) {
        const data = await response.json();
        if (data.scanState) {
          setScanState(normalizeScanState(data.scanState));
        }
        setLastChecked(new Date());
      }
    } catch (error) {
      console.error("Error checking scan status:", error);
    }
  };

  const startScan = async () => {
    setIsStarting(true);
    try {
      const response = await fetch("/api/music/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startBackground: true }),
      });

      if (response.ok) {
        await checkScanStatus();
      }
    } catch (error) {
      console.error("Error starting scan:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const resumeScan = async () => {
    try {
      // If server thinks not scanning, use startBackground which will resume partial progress;
      // otherwise use explicit resume endpoint.
      const body = !scanState?.isScanning
        ? { startBackground: true }
        : { resumeScan: true };
      const response = await fetch("/api/music/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await checkScanStatus();
      }
    } catch (error) {
      console.error("Error resuming scan:", error);
    }
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (!scanState) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="px-6 py-4">
          <h3 className="text-lg font-semibold">Music Library Scanner</h3>
        </CardHeader>
        <CardBody className="px-6 py-4">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No scan has been started yet.{" "}
              <b>
                Please set your music root path in the settings before start a
                scan.
              </b>
            </p>
            <Button
              color="primary"
              onPress={startScan}
              disabled={isStarting}
              startContent={
                isStarting ? (
                  <Spinner size="sm" />
                ) : (
                  <Play className="w-4 h-4" />
                )
              }
            >
              {isStarting ? "Starting..." : "Start Scan"}
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const isActive = scanState.isScanning;
  const hasError = !!scanState.error;
  const isCompleted =
    !isActive && !hasError && scanState.scannedPaths.length > 0;
  const duration = Date.now() - scanState.startTime;

  return (
    <Card className="shadow-lg">
      <CardBody className="px-6 py-4 space-y-4 overflow-hidden">
        <Accordion>
          <AccordionItem
            key="scanning"
            title={
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Music Library Scanner</h3>
                <div className="flex items-center space-x-2">
                  {isActive && (
                    <Chip
                      color="primary"
                      variant="flat"
                      startContent={
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      }
                    >
                      Scanning
                    </Chip>
                  )}
                  {isStalled && (
                    <Chip
                      color="warning"
                      variant="flat"
                      startContent={<AlertCircle className="w-4 h-4" />}
                    >
                      Stalled
                    </Chip>
                  )}
                  {isCompleted && (
                    <Chip
                      color="success"
                      variant="flat"
                      startContent={<CheckCircle className="w-4 h-4" />}
                    >
                      Completed
                    </Chip>
                  )}
                  {hasError && (
                    <Chip
                      color="danger"
                      variant="flat"
                      startContent={<AlertCircle className="w-4 h-4" />}
                    >
                      Error
                    </Chip>
                  )}
                </div>
              </div>
            }
          >
            {/* Progress Bar */}
            {isActive && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Progress</span>
                  <span>
                    {typeof scanState.scaned === "number" &&
                    typeof scanState.totalTopLevelFolders === "number"
                      ? `${scanState.scaned} / ${scanState.totalTopLevelFolders}`
                      : `${scanState.scannedPaths.length} folders scanned`}
                  </span>
                </div>
                <Progress
                  value={(() => {
                    if (
                      typeof scanState.scaned === "number" &&
                      typeof scanState.totalTopLevelFolders === "number" &&
                      scanState.totalTopLevelFolders > 0
                    ) {
                      return (
                        (scanState.scaned / scanState.totalTopLevelFolders) *
                        100
                      );
                    }
                    // Fallback to rough folder count
                    return scanState.scannedPaths.length > 0
                      ? (scanState.scannedPaths.length /
                          Math.max(scanState.scannedPaths.length + 1, 1)) *
                          100
                      : 0;
                  })()}
                  color="primary"
                  className="w-full pb-3"
                />
              </div>
            )}

            {/* Current Status */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Status:
                </span>
                <span className="ml-2 font-medium">
                  {isActive ? "Scanning..." : hasError ? "Error" : "Completed"}
                </span>
              </div>

              {isActive && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Current:
                  </span>
                  <span
                    className="ml-2 font-medium truncate"
                    title={
                      scanState.currentTopLevelFolder || scanState.currentPath
                    }
                  >
                    {(scanState.currentTopLevelFolder || scanState.currentPath)
                      .split("/")
                      .pop() || scanState.currentPath}
                  </span>
                </div>
              )}

              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Folders:
                </span>
                <span className="ml-2 font-medium">
                  {scanState.scannedPaths.length}
                </span>
              </div>

              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Music Files:
                </span>
                <span className="ml-2 font-medium">
                  {scanState.scanedMusicFile}
                </span>
              </div>

              {isActive && (
                <div className="col-span-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    Current subfolder:
                  </span>
                  <span
                    className="ml-2 font-medium break-all"
                    title={getCurrentSubfolderPath()}
                  >
                    {getCurrentSubfolderPath()}
                  </span>
                </div>
              )}

              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Started:
                </span>
                <span className="ml-2 font-medium">
                  {formatTime(scanState.startTime)}
                </span>
              </div>

              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Duration:
                </span>
                <span className="ml-2 font-medium">
                  {formatDuration(duration)}
                </span>
              </div>
            </div>

            {/* Error Display */}
            {hasError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-red-700 dark:text-red-300 text-sm">
                  <strong>Error:</strong> {scanState.error}
                </p>
              </div>
            )}

            {/* Last Updated */}
            {lastChecked && (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-5 pb-3">
                Last updated: {lastChecked.toLocaleTimeString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center space-x-3">
              {!isActive && (
                <Button
                  color="primary"
                  onPress={startScan}
                  disabled={isStarting}
                  startContent={
                    isStarting ? (
                      <Spinner size="sm" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )
                  }
                >
                  {isStarting ? "Starting..." : "Start New Scan"}
                </Button>
              )}

              {(hasError || canResume) && (
                <Button
                  color="warning"
                  onPress={resumeScan}
                  startContent={<RefreshCw className="w-4 h-4" />}
                >
                  Resume Scan
                </Button>
              )}

              <Button
                variant="light"
                onPress={checkScanStatus}
                startContent={<RefreshCw className="w-4 h-4" />}
              >
                Refresh Status
              </Button>

              <Button
                variant="light"
                onPress={async () => {
                  try {
                    const response = await fetch("/api/music/scan?stats=true");
                    if (response.ok) {
                      const stats = await response.json();
                      // console.log("Cache Stats:", stats);
                      alert(
                        `Cache Stats:\nPaths: ${stats.totalPaths}\nFiles: ${
                          stats.totalFiles
                        }\nFolders: ${stats.totalFolders}\nLast Updated: ${
                          stats.lastUpdated
                            ? new Date(stats.lastUpdated).toLocaleString()
                            : "Never"
                        }`
                      );
                    }
                  } catch (error) {
                    console.error("Error getting cache stats:", error);
                  }
                }}
                startContent={<CheckCircle className="w-4 h-4" />}
              >
                Cache Stats
              </Button>
            </div>
          </AccordionItem>
        </Accordion>
      </CardBody>
    </Card>
  );
}
