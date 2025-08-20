"use client";

import { useState, useEffect } from "react";
import { LogOut, User, Sun, Moon, Monitor } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import StickyPlayer from "@/components/StickyPlayer";
import FileExplorer from "@/components/FileExplorer";
import ScanManager from "@/components/ScanManager";
import TrackList from "@/components/TrackList";
import Login from "@/components/Login";
import { Button, Divider, Image, Spinner, Tab, Tabs } from "@heroui/react";

interface MusicFile {
  id: string;
  name: string;
  size: number;
  title?: string;
  artist?: string;
  folder?: string;
  lastModified?: string;
}

interface UserProfile {
  displayName: string;
  email: string;
  id: string;
  photoUrl: string | null;
}

export default function Home() {
  const { instance } = useMsal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<MusicFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cachedTracks, setCachedTracks] = useState<MusicFile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false;
      const saved = window.localStorage.getItem("player_shuffleEnabled");
      return saved === "1" || saved === "true";
    } catch {
      return false;
    }
  });
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(() => {
    try {
      if (typeof window === "undefined") return 0;
      const saved = window.localStorage.getItem("player_repeatMode");
      const n = Number(saved);
      return n === 1 || n === 2 ? (n as 1 | 2) : 0;
    } catch {
      return 0;
    }
  });

  type ThemeMode = "system" | "light" | "dark";
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      if (typeof window === "undefined") return "system";
      const saved = window.localStorage.getItem("ui_theme");
      return saved === "light" || saved === "dark" || saved === "system"
        ? (saved as ThemeMode)
        : "system";
    } catch {
      return "system";
    }
  });

  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("ui_theme", themeMode);
    } catch {}

    const prefersDarkMedia = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const shouldUseDark =
        themeMode === "dark" ||
        (themeMode === "system" && prefersDarkMedia.matches);
      const root = document.documentElement;
      if (shouldUseDark) root.classList.add("dark");
      else root.classList.remove("dark");
    };

    applyTheme();

    if (themeMode === "system") {
      try {
        prefersDarkMedia.addEventListener("change", applyTheme);
        return () => prefersDarkMedia.removeEventListener("change", applyTheme);
      } catch {
        // Safari < 14
        prefersDarkMedia.addListener?.(applyTheme);
        return () => prefersDarkMedia.removeListener?.(applyTheme);
      }
    }
  }, [themeMode]);

  const cycleThemeMode = () =>
    setThemeMode((m) =>
      m === "system" ? "light" : m === "light" ? "dark" : "system"
    );

  const effectiveThemeMode: ThemeMode = isClientMounted ? themeMode : "system";

  useEffect(() => {
    // Check if we're returning from OAuth with an error
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");

    if (error) {
      console.error("Authentication error:", error);
      // Clear any error parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Clear MSAL accounts when component mounts to ensure fresh state
    if (instance) {
      instance.clearCache();
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
  }, [instance]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch("/api/music");
      if (response.ok) {
        setIsAuthenticated(true);
        // Fetch user profile when authenticated
        fetchUserProfile();
      } else {
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const response = await fetch("/api/user/profile");
      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
      } else {
        console.error(
          "Failed to fetch user profile:",
          response.status,
          response.statusText
        );
        // Don't set userProfile to null here, keep the existing state if any
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      // Don't set userProfile to null here, keep the existing state if any
    }
  };

  // Load cached tracks once authenticated
  useEffect(() => {
    const loadCache = async () => {
      try {
        const resp = await fetch("/api/music/cache");
        if (resp.ok) {
          const data = await resp.json();
          setCachedTracks(Array.isArray(data.tracks) ? data.tracks : []);
        }
      } catch {}
    };
    if (isAuthenticated) {
      loadCache();
    } else {
      setCachedTracks([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "player_shuffleEnabled",
        shuffleEnabled ? "1" : "0"
      );
    } catch {}
  }, [shuffleEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem("player_repeatMode", String(repeatMode));
    } catch {}
  }, [repeatMode]);

  const handleTrackSelect = (track: MusicFile) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const handleRootPathChange = () => {
    // Clear cached tracks when root path changes
    setCachedTracks([]);
    setCurrentTrack(null);
    setIsPlaying(false);
  };

  const handleNext = () => {
    if (!currentTrack || cachedTracks.length === 0) {
      // console.log("Next track - no cache available or no current track");
      return;
    }
    if (shuffleEnabled) {
      // pick a random index different from current when possible
      let nextIndex = Math.floor(Math.random() * cachedTracks.length);
      const currentIndex = cachedTracks.findIndex(
        (t) => t.id === currentTrack.id
      );
      if (cachedTracks.length > 1 && nextIndex === currentIndex) {
        nextIndex = (nextIndex + 1) % cachedTracks.length;
      }
      setCurrentTrack(cachedTracks[nextIndex]);
      setIsPlaying(true);
    } else {
      const index = cachedTracks.findIndex((t) => t.id === currentTrack.id);
      if (index >= 0 && index < cachedTracks.length - 1) {
        setCurrentTrack(cachedTracks[index + 1]);
        setIsPlaying(true);
      } else if (repeatMode === 1) {
        // wrap to start when repeat all
        setCurrentTrack(cachedTracks[0]);
        setIsPlaying(true);
      } else {
        // console.log("Next track - at end of cached list");
      }
    }
  };

  const handlePrevious = () => {
    if (!currentTrack || cachedTracks.length === 0) {
      // console.log("Previous track - no cache available or no current track");
      return;
    }
    const index = cachedTracks.findIndex((t) => t.id === currentTrack.id);
    if (index > 0) {
      setCurrentTrack(cachedTracks[index - 1]);
      setIsPlaying(true);
    } else {
      // console.log("Previous track - at start of cached list");
    }
  };

  const handleLogout = async () => {
    try {
      // Get the current account for logout
      const currentAccount = instance.getActiveAccount();

      if (currentAccount) {
        // Call logout API to clear server-side cookies
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (apiError) {
          console.error("API logout error:", apiError);
        }

        // Clear MSAL cache and accounts
        instance.clearCache();

        // Use MSAL logout with redirect and force account selection
        const logoutRequest = {
          account: currentAccount,
          postLogoutRedirectUri: window.location.origin,
          // Force account selection on next login
          authority: `https://login.microsoftonline.com/${
            process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "consumers"
          }`,
        };
        instance.logoutRedirect(logoutRequest);
      } else {
        // Fallback: clear cookies and state if no MSAL account
        await fetch("/api/auth/logout", { method: "POST" });
        // Clear MSAL cache
        instance.clearCache();
        document.cookie =
          "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie =
          "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie =
          "user_profile=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        setIsAuthenticated(false);
        setCurrentTrack(null);
        setIsPlaying(false);
        setUserProfile(null);
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Fallback logout
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        // Clear MSAL cache
        instance.clearCache();
      } catch (apiError) {
        console.error("API logout error:", apiError);
      }
      document.cookie =
        "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie =
        "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie =
        "user_profile=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      setIsAuthenticated(false);
      setCurrentTrack(null);
      setIsPlaying(false);
      setUserProfile(null);
    }
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
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8"
                  radius="none"
                />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white translate-y-0.5">
                OneDrive Music Player
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 border-2 rounded-xl border-gray-200 dark:border-gray-700 py-1.5 px-2">
                <i className="fa-solid fa-palette" />
                <Divider orientation="vertical" className="h-4" />
                <Button
                  onPress={cycleThemeMode}
                  variant="solid"
                  size="sm"
                  // className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  className="w-24 flex items-center justify-center"
                  startContent={
                    effectiveThemeMode === "system" ? (
                      <Monitor className="w-4 h-4" />
                    ) : effectiveThemeMode === "light" ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )
                  }
                >
                  <div className="translate-y-[1.5px]">
                    {effectiveThemeMode === "system"
                      ? "System"
                      : effectiveThemeMode === "light"
                      ? "Light"
                      : "Dark"}
                  </div>
                </Button>
              </div>
              {userProfile ? (
                <div className="flex items-center space-x-3">
                  {/* User Photo */}
                  {userProfile.photoUrl ? (
                    <img
                      src={userProfile.photoUrl}
                      alt="Profile"
                      className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                  )}

                  {/* User Info */}
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {userProfile.displayName || "User"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {userProfile.email}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                  <User className="w-4 h-4" />
                  <span>Connected to OneDrive</span>
                </div>
              )}

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
      <main className="px-4 sm:px-6 lg:px-8 pt-8 flex flex-col overflow-hidden h-[max(calc(100vh-64px-82px),_700px)]">
        <div className="flex flex-col gap-4 h-full min-h-0">
          {/* Scan Manager */}
          <div>
            <ScanManager />
          </div>

          {/* File Explorer / Track List area fills remaining height */}
          <Tabs fullWidth className="flex-1 min-h-5" color="primary">
            <Tab
              key="explorer"
              title="Explorer"
              className="h-full overflow-hidden"
            >
              <div className="h-full min-h-0 pb-6">
                <FileExplorer
                  onTrackSelect={handleTrackSelect}
                  currentTrackId={currentTrack?.id || null}
                  isPlaying={isPlaying}
                  onRootPathChange={handleRootPathChange}
                />
              </div>
            </Tab>
            <Tab
              key="track-list"
              title="Track List"
              className="h-full overflow-hidden"
            >
              <div className="h-full min-h-0 pb-6">
                <TrackList
                  onTrackSelect={handleTrackSelect}
                  currentTrackId={currentTrack?.id || null}
                  isPlaying={isPlaying}
                  onRootPathChange={handleRootPathChange}
                />
              </div>
            </Tab>
          </Tabs>
        </div>
      </main>

      {/* Sticky Bottom Player */}
      <StickyPlayer
        currentTrack={currentTrack}
        onNext={handleNext}
        onPrevious={handlePrevious}
        hasNext={(() => {
          if (!currentTrack || cachedTracks.length === 0) return false;
          if (shuffleEnabled) return cachedTracks.length > 1; // can always pick another when >1
          if (repeatMode === 1) return true; // wrap allowed
          const idx = cachedTracks.findIndex((t) => t.id === currentTrack.id);
          return idx >= 0 && idx < cachedTracks.length - 1;
        })()}
        hasPrevious={(() => {
          if (!currentTrack || cachedTracks.length === 0) return false;
          const idx = cachedTracks.findIndex((t) => t.id === currentTrack.id);
          return idx > 0;
        })()}
        isPlaying={isPlaying}
        onPlayPauseChange={setIsPlaying}
        shuffleEnabled={shuffleEnabled}
        onToggleShuffle={() => setShuffleEnabled((s) => !s)}
        repeatMode={repeatMode}
        onCycleRepeatMode={() =>
          setRepeatMode((m) => ((m + 1) % 3) as 0 | 1 | 2)
        }
      />
    </div>
  );
}
