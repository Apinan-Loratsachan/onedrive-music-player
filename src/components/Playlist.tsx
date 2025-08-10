"use client";

import { useState, useEffect } from "react";
import { Music, Play, Pause } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Spinner,
  Chip,
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

interface PlaylistProps {
  onTrackSelect: (track: MusicFile) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
}

export default function Playlist({
  onTrackSelect,
  currentTrackId,
  isPlaying,
}: PlaylistProps) {
  const [files, setFiles] = useState<MusicFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMusicFiles();
  }, []);

  const fetchMusicFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/music");

      if (!response.ok) {
        if (response.status === 401) {
          setError("Please log in to access your music library");
        } else {
          setError("Failed to fetch music files");
        }
        return;
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setError("Error loading music files");
      console.error("Error fetching music files:", err);
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardBody className="p-6">
          <div className="flex items-center justify-center">
            <Spinner size="lg" color="primary" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              Loading music library...
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardBody className="p-6">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Button onPress={fetchMusicFiles} color="primary" variant="flat">
              Retry
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardBody className="p-6">
          <div className="text-center">
            <Music className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No music files found
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Make sure you have music files in your OneDrive Music folder
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg overflow-hidden w-full h-full">
      <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Music Library ({files.length} tracks)
        </h2>
      </CardHeader>

      <CardBody className="p-0">
        <div className="max-h-full overflow-y-auto">
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
        </div>
      </CardBody>
    </Card>
  );
}
