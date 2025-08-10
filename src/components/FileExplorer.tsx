"use client";

import { useState, useEffect } from "react";
import { Music, Folder, Play, Pause, ArrowLeft, Home } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Spinner,
  Chip,
  Breadcrumbs,
  BreadcrumbItem,
  Divider,
} from "@heroui/react";

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
}

interface FileExplorerProps {
  onTrackSelect: (track: MusicFile) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
}

export default function FileExplorer({
  onTrackSelect,
  currentTrackId,
  isPlaying,
}: FileExplorerProps) {
  const [files, setFiles] = useState<MusicFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentPath, setCurrentPath] = useState(
    "Music/Music Library/Main Library"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([
    "Music/Music Library/Main Library",
  ]);

  useEffect(() => {
    fetchContents();
  }, [currentPath]);

  const fetchContents = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/music?path=${encodeURIComponent(currentPath)}`
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Please log in to access your music library");
        } else {
          setError("Failed to fetch contents");
        }
        return;
      }

      const data = await response.json();
      setFiles(data.files || []);
      setFolders(data.folders || []);
      setCurrentPath(data.currentPath || currentPath);
    } catch (err) {
      setError("Error loading contents");
      console.error("Error fetching contents:", err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderName: string) => {
    const newPath = currentPath + "/" + folderName;
    setPathHistory([...pathHistory, newPath]);
    setCurrentPath(newPath);
  };

  const navigateBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = pathHistory.slice(0, -1);
      const newPath = newHistory[newHistory.length - 1];
      setPathHistory(newHistory);
      setCurrentPath(newPath);
    }
  };

  const navigateHome = () => {
    const homePath = "Music/Music Library/Main Library";
    setPathHistory([homePath]);
    setCurrentPath(homePath);
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
        <Breadcrumbs>
          <BreadcrumbItem>
            <Button
              variant="light"
              size="sm"
              startContent={<Home className="w-4 h-4" />}
              onPress={navigateHome}
            >
              Home
            </Button>
          </BreadcrumbItem>
          {pathParts.map((part, index) => (
            <BreadcrumbItem key={`${part}-${index}`}>
              <Button
                variant="light"
                size="sm"
                onPress={() => {
                  const newPath = pathParts.slice(0, index + 1).join("/");
                  setPathHistory([...pathHistory.slice(0, index + 1), newPath]);
                  setCurrentPath(newPath);
                }}
              >
                {part}
              </Button>
            </BreadcrumbItem>
          ))}
        </Breadcrumbs>
      </>
    );
  };

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardBody className="p-6 overflow-auto">
          <div className="flex items-center justify-center">
            <Spinner size="lg" color="primary" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              Loading contents...
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

  return (
    <Card className="shadow-lg overflow-hidden w-full h-full">
      <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            File Explorer
          </h2>
          <div className="flex items-center space-x-2">
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

      <CardBody className="p-0">
        <div className="max-h-full overflow-y-auto">
          {/* Folders */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              onClick={() => navigateToFolder(folder.name)}
            >
              <div className="flex items-center space-x-3">
                <Folder className="h-5 w-5 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {folder.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Folder
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
                      <Pause className="h-5 w-5 text-blue-600" />
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
            <div className="px-6 py-8 text-center">
              <Music className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                This folder is empty
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
