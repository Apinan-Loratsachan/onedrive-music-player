"use client";

import { useState, useEffect } from "react";
import { Folder, Settings, Save, X } from "lucide-react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Tooltip,
} from "@heroui/react";

interface RootPathSelectorProps {
  currentPath: string;
  onPathChange: (newPath: string) => void;
  currentExplorerPath?: string; // Add current explorer path prop
}

export default function RootPathSelector({
  currentPath,
  onPathChange,
  currentExplorerPath,
}: RootPathSelectorProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [path, setPath] = useState(currentPath);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPath(currentPath);
  }, [currentPath]);

  const handleSave = async () => {
    // Allow empty paths (they represent OneDrive root)
    if (path.includes("..")) {
      setError("Invalid path format");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ musicRootPath: path.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update path");
      }

      const result = await response.json();
      onPathChange(result.musicRootPath);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update path");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setPath(currentPath);
    setError(null);
    onClose();
  };

  const handleUseCurrentPath = () => {
    if (currentExplorerPath && currentExplorerPath !== currentPath) {
      setPath(currentExplorerPath);
      setError(null);
    }
  };

  return (
    <>
      <Tooltip content="Change music root path">
        <Button
          variant="light"
          size="sm"
          startContent={<Settings className="w-4 h-4" />}
          onPress={onOpen}
        >
          Set Music Root
        </Button>
      </Tooltip>

      <Modal isOpen={isOpen} onClose={handleCancel} size="lg">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-blue-500" />
              <span>Music Root Path</span>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Set the root path for your music library. This is the starting
                  point for browsing your music files.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Examples: Leave empty for OneDrive root, "Music" for Music
                  folder, "Documents/Music" for nested folders
                </p>
              </div>

              <Input
                label="Root Path"
                placeholder="Leave empty for OneDrive root, or enter folder path (e.g., Music, Documents/Music)"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                startContent={<Folder className="w-4 h-4 text-gray-400" />}
                isInvalid={!!error}
                errorMessage={error}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
              />

              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>Current root path:</strong>{" "}
                  {currentPath || "OneDrive Root (/) (no subfolder)"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <strong>New path:</strong>{" "}
                  {path || "OneDrive Root (/) (no subfolder)"}
                </p>
                {currentExplorerPath && currentExplorerPath !== currentPath && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <strong>Current explorer location:</strong>{" "}
                      {currentExplorerPath ||
                        "OneDrive Root (/) (no subfolder)"}
                    </p>
                    <Button
                      size="sm"
                      variant="flat"
                      color="secondary"
                      onPress={handleUseCurrentPath}
                      startContent={<Folder className="w-3 h-3" />}
                    >
                      Use Current Path as Root
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={handleCancel}>
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={isLoading}
              startContent={<Save className="w-4 h-4" />}
            >
              Save Path
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
