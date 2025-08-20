"use client";

import { useState, useEffect } from "react";
import {
  Music,
  Folder,
  Play,
  ArrowLeft,
  Home,
  FolderCheck,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Divider,
  Spinner,
  Breadcrumbs,
  BreadcrumbItem,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import RootPathSelector from "./RootPathSelector";
import Visualizer from "@/components/Visualizer";

// Extend Window interface to include our custom function
declare global {
  interface Window {
    resetScanManager?: () => void;
  }
}

interface MusicFile {
  id: string;
  name: string;
  size: number;
  title?: string;
  artist?: string;
  folder?: string;
  lastModified?: string;
  "@microsoft.graph.downloadUrl"?: string;
}

interface FolderItem {
  id: string;
  name: string;
  folder: any;
  webUrl?: string;
  createdBy?: {
    user: {
      email: string;
      id: string;
      displayName: string;
    };
  };
}

interface FileExplorerProps {
  onTrackSelect: (track: MusicFile) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  onRootPathChange?: () => void;
}

export default function FileExplorer({
  onTrackSelect,
  currentTrackId,
  isPlaying,
  onRootPathChange,
}: FileExplorerProps) {
  const [files, setFiles] = useState<MusicFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [pathNotFound, setPathNotFound] = useState(false);
  const [driveType, setDriveType] = useState<"personal" | "shared">("personal");
  const [rootDriveType, setRootDriveType] = useState<"personal" | "shared">(
    "personal"
  );
  const [driveId, setDriveId] = useState("");
  const [itemId, setItemId] = useState("");
  const [userSettingsLoaded, setUserSettingsLoaded] = useState(false);
  const [hasInitializedFromSettings, setHasInitializedFromSettings] =
    useState(false);

  useEffect(() => {
    fetchUserSettings();
  }, []);

  useEffect(() => {
    console.log("FileExplorer: rootPath changed to:", rootPath);
    // Initialize explorer location from saved music root ONCE after user settings load
    if (userSettingsLoaded && !hasInitializedFromSettings) {
      if (driveType === "shared") {
        // For shared, start at shared root, not the saved personal path
        setCurrentPath("shared");
        setPathHistory(["shared"]);
      } else {
        // Personal: apply saved root path (can be empty for root)
        setCurrentPath(rootPath);
        setPathHistory([rootPath]);
      }
      setHasInitializedFromSettings(true);
      // Don't call fetchContents here, let the currentPath useEffect handle it
    }
  }, [rootPath, userSettingsLoaded, hasInitializedFromSettings, driveType]);

  useEffect(() => {
    console.log("FileExplorer: currentPath changed to:", currentPath);
    // Defer initial fetch until user settings are loaded to avoid double fetch
    if (!userSettingsLoaded) return;

    // Always fetch when dependencies change; allow driveType switch to take effect immediately
    fetchContents();
  }, [currentPath, driveType, driveId, itemId, userSettingsLoaded]);

  const fetchUserSettings = async () => {
    try {
      const response = await fetch("/api/user/settings");
      if (response.ok) {
        const settings = await response.json();
        setRootPath(
          settings.musicRootPath || "" // Empty string represents OneDrive root
        );
        if (
          settings.driveType === "shared" ||
          settings.driveType === "personal"
        ) {
          setRootDriveType(settings.driveType);
          setDriveType(settings.driveType);
        }
        setUserSettingsLoaded(true);
      } else {
        // Fallback to default path
        setRootPath("");
        setUserSettingsLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching user settings:", error);
      // Fallback to default path
      setRootPath("");
      setUserSettingsLoaded(true);
    }
  };

  const fetchContents = async () => {
    console.log(
      "FileExplorer: fetchContents called with currentPath:",
      currentPath
    );

    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      setPathNotFound(false); // Clear any previous path not found state

      // Handle empty path (OneDrive root) properly
      let queryParams = new URLSearchParams();
      if (currentPath !== "") {
        queryParams.append("path", currentPath);
      }
      // Always include driveType to avoid falling back to saved settings
      queryParams.append("driveType", driveType);
      if (driveType === "shared") {
        if (driveId) queryParams.append("driveId", driveId);
        if (itemId) queryParams.append("itemId", itemId);
      }

      const queryString = queryParams.toString();
      const apiUrl = `/api/music${queryString ? `?${queryString}` : ""}`;
      console.log("FileExplorer: Calling API:", apiUrl);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        if (response.status === 401) {
          setError("Please log in to access your music library");
        } else {
          setError("Failed to fetch contents");
        }
        return;
      }

      const data = await response.json();
      console.log("FileExplorer: API response data:", data);

      setFiles(data.files || []);
      setFolders(data.folders || []);
      setPathNotFound(data.pathNotFound || false);
      setDriveType(data.driveType || "personal");
      setDriveId(data.driveId || "");
      setItemId(data.itemId || "");
      if (data.pathNotFound) {
        setRootPath("");
      }
      // Don't update currentPath here to avoid infinite loops
      // setCurrentPath(data.currentPath || currentPath);
    } catch (err) {
      setError("Error loading contents");
      console.error("Error fetching contents:", err);
    } finally {
      setLoading(false);
      console.log(
        "FileExplorer: fetchContents completed, loading set to false"
      );
    }
  };

  const navigateToFolder = (folder: FolderItem) => {
    const newPath = currentPath + "/" + folder.name;
    setPathHistory([...pathHistory, newPath]);
    setCurrentPath(newPath);
    setPathNotFound(false); // Clear path not found state when navigating

    // If we're in a shared drive, extract drive and item IDs for navigation
    if (driveType === "shared" && folder.folder) {
      if (folder.id) {
        setItemId(folder.id);
      }

      // Extract drive ID from webUrl if available
      if (folder.webUrl) {
        const urlParams = new URLSearchParams(folder.webUrl.split("?")[1]);
        const cid = urlParams.get("cid");
        if (cid) {
          setDriveId(cid);
        }
      }
    }
  };

  const navigateBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = pathHistory.slice(0, -1);
      const newPath = newHistory[newHistory.length - 1];
      setPathHistory(newHistory);
      setCurrentPath(newPath);
      setPathNotFound(false); // Clear path not found state when navigating

      // If navigating back to shared root, clear drive-specific IDs
      if (newPath === "shared") {
        setDriveId("");
        setItemId("");
      }
    }
  };

  const handleRootPathChange = (newRootPath: string) => {
    setRootPath(newRootPath);
    setCurrentPath(newRootPath);
    setPathHistory([newRootPath]);
    // Clear current data to force refresh
    setFiles([]);
    setFolders([]);
    setPathNotFound(false); // Clear path not found state

    // Reset scan manager state to "not scanning"
    if (typeof window !== "undefined" && window.resetScanManager) {
      window.resetScanManager();
    }

    // Notify parent component about root path change
    if (onRootPathChange) {
      onRootPathChange();
    }
  };

  const navigateToShared = () => {
    // Navigate to shared with me section
    setPathHistory(["shared"]);
    setCurrentPath("shared");
    setPathNotFound(false);
    setDriveType("shared");
    setDriveId("");
    setItemId("");
  };

  const navigateToPersonal = () => {
    // Navigate to personal OneDrive
    setPathHistory([""]);
    setCurrentPath("/");
    setPathNotFound(false);
    setDriveType("personal");
    setDriveId("");
    setItemId("");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileExtension = (filename: string) => {
    return filename.split(".").pop()?.toUpperCase() || "";
  };

  const renderBreadcrumb = () => {
    const pathParts = currentPath.split("/");
    return (
      <>
        <div className="mx-2">
          <Divider className="h-6 w-0.5" orientation="vertical" />
        </div>
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="light"
              size="sm"
              startContent={
                driveType === "shared" ? (
                  <Folder className="w-4 h-4" />
                ) : (
                  <Home className="w-4 h-4" />
                )
              }
              endContent={<ChevronDown className="w-4 h-4" />}
            >
              {driveType === "shared" ? "Shared With Me" : "Personal OneDrive"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Home navigation"
            onAction={(key) => {
              if (key === "personal") {
                navigateToPersonal();
              } else if (key === "shared") {
                navigateToShared();
              }
            }}
          >
            <DropdownItem
              key="personal"
              startContent={<Home className="w-4 h-4" />}
            >
              Personal OneDrive
            </DropdownItem>
            <DropdownItem
              key="shared"
              startContent={<Folder className="w-4 h-4" />}
            >
              Shared With Me
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
        <div className="mx-2">
          <Divider className="h-6 w-[1.5px]" orientation="vertical" />
        </div>
        <Breadcrumbs>
          {driveType === "personal" && (
            <BreadcrumbItem>
              <Button variant="light" size="sm" onPress={navigateToPersonal}>
                ROOT
              </Button>
            </BreadcrumbItem>
          )}
          {pathParts.map(
            (part, index) =>
              part !== "" && (
                <BreadcrumbItem key={`${part}-${index}`}>
                  <Button
                    variant="light"
                    size="sm"
                    onPress={() => {
                      if (pathParts.length > index + 1) {
                        const newPath: string = pathParts
                          .slice(0, index + 1)
                          .join("/");
                        setPathHistory([
                          ...pathHistory.slice(0, index + 1),
                          newPath,
                        ]);
                        setCurrentPath(newPath);
                        setPathNotFound(false);

                        // If navigating back to shared root, clear drive-specific IDs
                        if (newPath === "shared") {
                          setDriveId("");
                          setItemId("");
                        }
                      }
                    }}
                  >
                    {part}
                  </Button>
                </BreadcrumbItem>
              )
          )}
        </Breadcrumbs>
      </>
    );
  };

  if (loading) {
    console.log(
      "FileExplorer: Rendering loading state, currentPath:",
      currentPath,
      "files:",
      files.length,
      "folders:",
      folders.length
    );
    return (
      <Card className="shadow-lg flex h-full">
        <CardBody className="p-6 overflow-auto h-full items-center justify-center">
          <div className="flex flex-col items-center justify-center">
            <Spinner size="lg" color="primary" />
            <span className="mt-2 text-gray-600 dark:text-gray-400">
              Loading contents...
            </span>
            <span className="mt-1 text-xs text-gray-400">
              Path: {currentPath || "OneDrive Root"}
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg overflow-auto">
        <CardBody className="p-6">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Button onPress={fetchContents} color="primary" variant="flat">
              Retry
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  console.log(
    "FileExplorer: About to render, currentPath:",
    currentPath,
    "files:",
    files.length,
    "folders:",
    folders.length,
    "loading:",
    loading,
    "error:",
    error
  );

  return (
    <Card className="shadow-lg overflow-hidden w-full h-full">
      <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            File Explorer {driveType === "shared" && "(Shared)"}
          </h2>
          <div className="flex items-center space-x-2">
            <RootPathSelector
              currentPath={rootPath}
              onPathChange={handleRootPathChange}
              currentExplorerPath={currentPath}
              currentDriveType={driveType}
              currentDriveId={driveId}
              currentItemId={itemId}
            />
            {rootPath !== "" && (
              <div>
                <Button
                  variant={currentPath === rootPath ? "flat" : "shadow"}
                  color={currentPath === rootPath ? "default" : "primary"}
                  size="sm"
                  onPress={() => {
                    setDriveType(rootDriveType);
                    setCurrentPath(rootPath);
                    setPathHistory([rootPath]);
                    setPathNotFound(false);
                  }}
                  startContent={<FolderCheck className="w-4 h-4" />}
                >
                  Music Root
                </Button>
              </div>
            )}
            {pathHistory.length > 1 && (
              <Button
                variant="light"
                size="sm"
                startContent={<ArrowLeft className="w-4 h-4" />}
                onPress={navigateBack}
              >
                Back
              </Button>
            )}
          </div>
        </div>
        {renderBreadcrumb()}
      </CardHeader>

      <CardBody
        className={`p-0 inline-block ${
          pathNotFound ? "flex items-center justify-center" : ""
        }`}
      >
        <div className="h-full max-h-full overflow-y-auto">
          {/* Folders */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              onClick={() => navigateToFolder(folder)}
            >
              <div className="flex items-center space-x-3">
                <Folder className="h-5 w-5 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {folder.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {driveType === "shared" ? "Shared Folder" : "Folder"}
                    {folder.createdBy && (
                      <span className="ml-2 text-blue-500">
                        by {folder.createdBy.user.displayName}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Audio Files */}
          {files.map((file, index) => (
            <div
              key={file.id}
              className={`px-6 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                currentTrackId === file.id
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : ""
              }`}
              onClick={() => onTrackSelect(file)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {currentTrackId === file.id && isPlaying ? (
                      <Visualizer />
                    ) : (
                      <Play className="h-5 w-5 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        currentTrackId === file.id
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {file.title || file.name}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {file.artist && (
                        <span className="text-blue-500 dark:text-blue-400">
                          {file.artist}
                        </span>
                      )}
                      <Chip size="sm" variant="flat" className="text-xs">
                        {getFileExtension(file.name)}
                      </Chip>
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-400">#{index + 1}</div>
              </div>
            </div>
          ))}

          {/* Empty state */}
          {folders.length === 0 && files.length === 0 && (
            <div className="h-full flex items-center justify-center flex-col px-6 py-8 text-center">
              <Music className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {pathNotFound
                  ? "Path not found"
                  : currentPath === "shared"
                  ? "No shared folders available"
                  : currentPath === ""
                  ? "OneDrive is empty"
                  : "This folder is empty"}
              </p>
              {pathNotFound && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  The path "{currentPath}" could not be found in your OneDrive
                  <br />
                  <br />
                  <b>Please set new Music Root path.</b>
                </p>
              )}
              {pathNotFound && (
                <Button
                  onPress={() => {
                    if (driveType === "shared") {
                      navigateToPersonal();
                    } else {
                      navigateToPersonal();
                    }
                  }}
                  color="primary"
                  variant="flat"
                  className="mt-4"
                >
                  Go to Personal OneDrive
                </Button>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
