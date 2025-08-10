"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";
import { Button, Slider, Switch } from "@heroui/react";

interface StickyPlayerProps {
  currentTrack: {
    id: string;
    name: string;
    size: number;
    title?: string;
    artist?: string;
    folder?: string;
  } | null;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  isPlaying: boolean;
  onPlayPauseChange: (playing: boolean) => void;
  shuffleEnabled: boolean;
  onToggleShuffle: () => void;
  repeatMode: 0 | 1 | 2;
  onCycleRepeatMode: () => void;
}

export default function StickyPlayer({
  currentTrack,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  isPlaying: externalIsPlaying,
  onPlayPauseChange,
  shuffleEnabled,
  onToggleShuffle,
  repeatMode,
  onCycleRepeatMode,
}: StickyPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playSwitchSelected, setPlaySwitchSelected] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false;
      const saved = window.localStorage.getItem(
        "stickyPlayer_playSwitchSelected"
      );
      if (saved === "1" || saved === "true") return true;
      if (saved === "0" || saved === "false") return false;
      return false;
    } catch {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = `/api/music/stream?fileId=${currentTrack.id}`;
      audioRef.current.load();
    }
  }, [currentTrack]);

  // Sync internal isPlaying state with external prop and control audio
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      if (externalIsPlaying) {
        // Auto-play when track is selected
        audioRef.current.play().catch((error) => {
          console.error("Auto-play failed:", error);
          onPlayPauseChange(false);
        });
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [externalIsPlaying, currentTrack, onPlayPauseChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    };
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      // Autoplay behaviors gated by the playSwitchSelected toggle
      if (!playSwitchSelected) {
        setIsPlaying(false);
        return;
      }
      // Repeat current track
      if (repeatMode === 2) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => undefined);
          setIsPlaying(true);
        }
        return;
      }
      setIsPlaying(false);
      if (hasNext || repeatMode === 1) {
        onNext();
      }
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleCanPlayThrough = () => setIsBuffering(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("canplaythrough", handleCanPlayThrough);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("canplaythrough", handleCanPlayThrough);
    };
  }, [onNext, isSeeking, hasNext, playSwitchSelected, repeatMode]);

  // Debounce committing seek to the audio element by 1s after user stops changing the slider
  useEffect(() => {
    if (pendingSeekTime == null) return;
    const timeoutId = setTimeout(() => {
      if (audioRef.current && Number.isFinite(pendingSeekTime)) {
        audioRef.current.currentTime = pendingSeekTime;
      }
      setIsSeeking(false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [pendingSeekTime]);

  // Persist play/pause switch selection
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "stickyPlayer_playSwitchSelected",
        playSwitchSelected ? "1" : "0"
      );
    } catch {}
  }, [playSwitchSelected]);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        onPlayPauseChange(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
        onPlayPauseChange(true);
      }
    }
  };

  const handleVolumeChange = (value: number | number[]) => {
    const newVolume = Array.isArray(value) ? value[0] : value;
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!currentTrack) {
    return null; // Don't show player if no track is selected
  }

  return (
    <>
      <audio ref={audioRef} />

      {/* Sticky Bottom Player */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
        {/* Seekbar */}
        <div className="relative">
          <div className="px-5 relative">
            <Slider
              // size="sm"
              step={0.01}
              minValue={0}
              maxValue={
                Number.isFinite(duration) && duration > 0 ? duration : 1
              }
              value={
                Number.isFinite(currentTime)
                  ? Math.min(currentTime, duration || 0)
                  : 0
              }
              onChange={(value) => {
                const newTime = Array.isArray(value) ? value[0] : value;
                if (!isNaN(newTime)) {
                  // Update UI immediately while user is sliding
                  setCurrentTime(newTime);
                  setIsSeeking(true);
                  // Commit to audio element after debounce period
                  setPendingSeekTime(newTime);
                }
              }}
              isDisabled={
                !Number.isFinite(duration) || duration === 0 || isBuffering
              }
              className="w-full absolute -top-4 left-0"
              classNames={{
                track: "bg-gray-200 dark:bg-gray-700",
                filler: "bg-blue-600",
                thumb: "bg-blue-600",
              }}
              aria-label="Seek"
            />
          </div>

          {/* Time Display */}
          <div className="absolute top-3 left-0 right-0 flex justify-between text-xs text-gray-500 dark:text-gray-400 px-5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            {/* Left: Track Info */}
            <div className="flex items-center space-x-4 min-w-0 flex-1">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <div className="w-6 h-6 text-blue-600 dark:text-blue-400 text-center">
                  <i className="fa-solid fa-music fa-xl -translate-x-[0.5px]" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {currentTrack.title || currentTrack.name}
                </h4>
                {currentTrack.artist && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {currentTrack.artist}
                  </p>
                )}
              </div>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center space-x-2">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={onPrevious}
                isDisabled={!hasPrevious}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <SkipBack size={18} />
              </Button>

              <Button
                isIconOnly
                color="primary"
                size="lg"
                onPress={togglePlayPause}
                className="bg-blue-600 hover:bg-blue-700 shadow-lg"
                isDisabled={isBuffering}
              >
                {isBuffering ? (
                  <i className="fa-solid fa-download fa-beat-fade" />
                ) : isPlaying ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} />
                )}
              </Button>

              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={onNext}
                isDisabled={!hasNext && !shuffleEnabled && repeatMode !== 1}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <SkipForward size={18} />
              </Button>
            </div>

            {/* Right: Volume and Additional Controls */}
            <div className="flex items-center space-x-3 flex-1 justify-end">
              <div className="hidden sm:flex items-center space-x-2">
                <Switch
                  isSelected={playSwitchSelected}
                  onValueChange={setPlaySwitchSelected}
                  thumbIcon={({ isSelected }) =>
                    isSelected ? (
                      <i className="fa-solid fa-play text-black translate-x-[1px]" />
                    ) : (
                      <i className="fa-solid fa-pause" />
                    )
                  }
                />
                <Button
                  isIconOnly
                  variant={shuffleEnabled ? "shadow" : "light"}
                  color={shuffleEnabled ? "primary" : "default"}
                  size="sm"
                  onPress={onToggleShuffle}
                  className={`${
                    shuffleEnabled
                      ? "text-white"
                      : "text-gray-600 hover:text-gray-900"
                  } dark:text-gray-400 dark:hover:text-white`}
                >
                  <Shuffle size={18} />
                </Button>
                <Button
                  isIconOnly
                  variant={repeatMode !== 0 ? "shadow" : "light"}
                  color={repeatMode !== 0 ? "primary" : "default"}
                  size="sm"
                  onPress={onCycleRepeatMode}
                  className={`${
                    repeatMode !== 0
                      ? "text-white"
                      : "text-gray-600 hover:text-gray-900"
                  } dark:text-gray-400 dark:hover:text-white`}
                >
                  {repeatMode === 2 ? (
                    <Repeat1 size={18} />
                  ) : (
                    <Repeat size={18} />
                  )}
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={toggleMute}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </Button>

                {/* Volume Slider */}
                <div
                // className={`transition-all duration-200 ${
                //   showVolumeControl ? "w-20 opacity-100" : "w-0 opacity-0"
                // } overflow-hidden`}
                >
                  <Slider
                    aria-label="Volume"
                    size="sm"
                    step={0.01}
                    minValue={0}
                    maxValue={1}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20"
                    classNames={{
                      track: "bg-gray-200 dark:bg-gray-700",
                      filler: "bg-blue-600",
                      thumb: "bg-blue-600",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom padding to prevent content from being hidden behind sticky player */}
      <div className="h-20" />
    </>
  );
}
