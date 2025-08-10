"use client";

import { useState, useEffect } from "react";
import { LogOut, Music, User } from "lucide-react";
import StickyPlayer from "@/components/StickyPlayer";
import FileExplorer from "@/components/FileExplorer";
import ScanManager from "@/components/ScanManager";
import Login from "@/components/Login";
import { Button, Spinner } from "@heroui/react";

interface MusicFile {
  id: string;
  name: string;
  size: number;
  title?: string;
  artist?: string;
  folder?: string;
  lastModified?: string;
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<MusicFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we're returning from OAuth with an error
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");

    if (error) {
      console.error("Authentication error:", error);
      // Clear any error parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    checkAuthStatus();

    // Listen for page visibility changes (when user returns from OAuth)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAuthStatus();
      }
    };

    // Also check auth status periodically to catch token expiration
    const intervalId = setInterval(checkAuthStatus, 30000); // Check every 30 seconds

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch("/api/music");
      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSelect = (track: MusicFile) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const handleNext = () => {
    // For now, next/previous functionality is limited since we don't have a playlist
    // This could be enhanced later to remember recently played tracks
    console.log("Next track - not implemented in explorer mode");
  };

  const handlePrevious = () => {
    // For now, previous functionality is limited since we don't have a playlist
    // This could be enhanced later to remember recently played tracks
    console.log("Previous track - not implemented in explorer mode");
  };

  const handleLogout = () => {
    // Clear cookies by setting them to expire
    document.cookie =
      "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setIsAuthenticated(false);
    setCurrentTrack(null);
    setIsPlaying(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" color="primary" className="mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 left-0 w-full z-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Music className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                OneDrive Music Player
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="w-4 h-4" />
                <span>Connected to OneDrive</span>
              </div>
              <Button
                onPress={handleLogout}
                variant="light"
                size="sm"
                startContent={<LogOut className="w-4 h-4" />}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-h-screen px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-h-screen grid grid-cols-1 gap-4 h-full">
          {/* Scan Manager */}
          <div className="mb-6">
            <ScanManager />
          </div>

          {/* File Explorer - Full Width */}
          <div className="max-h-[calc(100vh-39rem)]">
            <FileExplorer
              onTrackSelect={handleTrackSelect}
              currentTrackId={currentTrack?.id || null}
              isPlaying={isPlaying}
            />
          </div>
        </div>
      </main>

      {/* Sticky Bottom Player */}
      <StickyPlayer
        currentTrack={currentTrack}
        onNext={handleNext}
        onPrevious={handlePrevious}
        hasNext={false}
        hasPrevious={false}
        isPlaying={isPlaying}
        onPlayPauseChange={setIsPlaying}
      />
    </div>
  );
}
