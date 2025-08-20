"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronDown,
} from "lucide-react";
import { Button, Image as HeroImage, Slider, Switch } from "@heroui/react";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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

  // Fetched metadata (ID3) for the current track
  const [trackMeta, setTrackMeta] = useState<{
    title: string | null;
    artist: string | null;
    album: string | null;
    picture: string | null;
  } | null>(null);
  const [mediaArtwork, setMediaArtwork] = useState<{
    src: string;
    sizes?: string;
  } | null>(null);

  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = `/api/music/stream?fileId=${currentTrack.id}`;
      audioRef.current.load();
    }
  }, [currentTrack]);

  // Close on ESC and lock body scroll when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isExpanded]);

  // Load ID3 metadata for the current track
  useEffect(() => {
    setTrackMeta(null);
    if (!currentTrack?.id) return;
    const controller = new AbortController();
    let isAborted = false;
    (async () => {
      try {
        const resp = await fetch(
          `/api/music/metadata?fileId=${currentTrack.id}`,
          {
            signal: controller.signal,
          }
        );
        if (!resp.ok) return;
        const data = await resp.json();
        if (isAborted) return;
        setTrackMeta({
          title: data?.title ?? null,
          artist: data?.artist ?? null,
          album: data?.album ?? null,
          picture: typeof data?.picture === "string" ? data.picture : null,
        });
      } catch {}
    })();
    return () => {
      isAborted = true;
      controller.abort();
    };
  }, [currentTrack?.id]);

  // Prepare media session artwork limited to max 1000px on either dimension
  useEffect(() => {
    setMediaArtwork(null);
    const picture = trackMeta?.picture;
    if (!picture) return;

    let canceled = false;
    const imgEl = new window.Image();
    imgEl.onload = () => {
      if (canceled) return;
      const originalWidth = imgEl.naturalWidth || imgEl.width;
      const originalHeight = imgEl.naturalHeight || imgEl.height;
      const maxDim = 1000;
      const maxOriginal = Math.max(originalWidth, originalHeight);
      if (!maxOriginal || maxOriginal <= maxDim) {
        setMediaArtwork({
          src: picture,
          sizes: `${originalWidth}x${originalHeight}`,
        });
        return;
      }
      const scale = maxDim / maxOriginal;
      const targetWidth = Math.max(1, Math.round(originalWidth * scale));
      const targetHeight = Math.max(1, Math.round(originalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setMediaArtwork({ src: picture });
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgEl, 0, 0, targetWidth, targetHeight);

      // Prefer original mime type when possible
      const isPng = picture.startsWith("data:image/png");
      const mime = isPng ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(mime, 0.92);
      setMediaArtwork({
        src: dataUrl,
        sizes: `${targetWidth}x${targetHeight}`,
      });
    };
    imgEl.onerror = () => {
      if (canceled) return;
      setMediaArtwork({ src: picture });
    };
    imgEl.src = picture;
    return () => {
      canceled = true;
    };
  }, [trackMeta?.picture, currentTrack?.id]);

  // Set up media session for system media controls
  useEffect(() => {
    if ("mediaSession" in navigator && currentTrack) {
      const artwork = mediaArtwork
        ? [{ src: mediaArtwork.src, sizes: mediaArtwork.sizes }]
        : undefined;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: trackMeta?.title || currentTrack.title || currentTrack.name,
        artist: trackMeta?.artist || currentTrack.artist || "Unknown Artist",
        album: trackMeta?.album || currentTrack.folder || "Unknown Album",
        artwork,
      } as MediaMetadataInit);

      navigator.mediaSession.setActionHandler("play", () => {
        if (audioRef.current) {
          audioRef.current.play();
          setIsPlaying(true);
          onPlayPauseChange(true);
        }
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
          onPlayPauseChange(false);
        }
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (hasPrevious) {
          onPrevious();
        }
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (hasNext || shuffleEnabled || repeatMode !== 0) {
          onNext();
        }
      });

      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(
            0,
            audioRef.current.currentTime - 10
          );
        }
      });

      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.min(
            audioRef.current.duration,
            audioRef.current.currentTime + 10
          );
        }
      });

      navigator.mediaSession.setActionHandler("stop", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          onPlayPauseChange(false);
        }
      });
    }
  }, [
    currentTrack,
    hasNext,
    hasPrevious,
    shuffleEnabled,
    repeatMode,
    onPlayPauseChange,
    onNext,
    onPrevious,
    trackMeta,
    mediaArtwork,
  ]);

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
        // Update media session playback state
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
        // Update media session playback state
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      }
    }
  }, [externalIsPlaying, currentTrack, onPlayPauseChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
        // Update media session position state
        if ("mediaSession" in navigator) {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            position: audio.currentTime,
            playbackRate: audio.playbackRate,
          });
        }
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
              size="sm"
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
              className="w-full absolute -top-3 left-0 cursor-pointer"
              aria-label="Seek"
            />
          </div>

          {/* Time Display */}
          <div className="absolute top-3 left-0 right-0 flex justify-between text-xs text-gray-500 dark:text-gray-400 px-5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="px-14 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto">
            {/* Left: Track Info */}
            <div className="flex items-center min-w-0 flex-1">
              <div
                className="z-100 cursor-pointer"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => setIsExpanded(true)}
              >
                {trackMeta?.picture ? (
                  <HeroImage
                    isBlurred
                    src={trackMeta.picture}
                    alt="Album art"
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0 z-100">
                    <div className="w-6 h-6 text-blue-600 dark:text-blue-400 text-center">
                      <i className="fa-solid fa-music fa-xl -translate-x-[0.5px]" />
                    </div>
                  </div>
                )}
              </div>
              <Button
                size="lg"
                variant="light"
                radius="sm"
                className="text-left p-0 pl-8 pr-2 -translate-x-5"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onPress={() => setIsExpanded(true)}
                data-hover={isHovered}
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {trackMeta?.title ||
                      currentTrack.title ||
                      currentTrack.name}
                  </h4>
                  {(() => {
                    const subtitle = [
                      trackMeta?.artist || currentTrack.artist,
                      trackMeta?.album || currentTrack.folder,
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    return subtitle ? (
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {subtitle}
                      </p>
                    ) : null;
                  })()}
                </div>
              </Button>
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
              <div className="flex items-center space-x-2">
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
                  // size="sm"
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

      {/* Full-screen overlay */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="full-player"
            initial={{ y: "100%", opacity: 0.9 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            drag="y"
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (info.offset.y > 160 || info.velocity.y > 600) {
                setIsExpanded(false);
              }
            }}
            className="fixed inset-0 z-[110] bg-white dark:bg-gray-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <Button
                isIconOnly
                variant="light"
                onPress={() => setIsExpanded(false)}
                aria-label="Close full-screen"
              >
                <ChevronDown />
              </Button>
              <div className="min-w-0 text-center flex-1 px-2">
                <div className="truncate font-semibold text-gray-900 dark:text-white">
                  {trackMeta?.title || currentTrack.title || currentTrack.name}
                </div>
                <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {trackMeta?.artist ||
                    currentTrack.artist ||
                    currentTrack.folder}
                  {trackMeta?.album && ` • "${trackMeta.album}"`}
                </div>
              </div>
              <div className="w-[40px]" />
            </div>

            {/* Content */}
            <div className="h-[calc(100%-56px)] flex flex-col items-center overflow-y-auto">
              <div className="w-full max-w-4xl p-6 pt-8 flex flex-col items-center gap-6">
                {/* Artwork */}
                <div className="w-full flex items-center justify-center">
                  {trackMeta?.picture ? (
                    <HeroImage
                      isBlurred
                      src={trackMeta.picture}
                      alt="Album art"
                      className="w-[50vh] aspect-square rounded-2xl object-cover shadow-2xl"
                    />
                  ) : (
                    <div className="w-full max-w-[640px] aspect-square rounded-2xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center shadow-2xl">
                      <div className="w-20 h-20 text-blue-600 dark:text-blue-400 text-center">
                        <i className="fa-solid fa-music fa-2xl -translate-x-[2px]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Seekbar */}
                <div className="w-full px-2">
                  <Slider
                    size="md"
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
                        setCurrentTime(newTime);
                        setIsSeeking(true);
                        setPendingSeekTime(newTime);
                      }
                    }}
                    isDisabled={
                      !Number.isFinite(duration) ||
                      duration === 0 ||
                      isBuffering
                    }
                    aria-label="Seek"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="w-full flex flex-col items-center gap-4 pt-2">
                  <div className="flex items-center gap-3">
                    <Button
                      isIconOnly
                      variant={shuffleEnabled ? "shadow" : "light"}
                      color={shuffleEnabled ? "primary" : "default"}
                      size="md"
                      onPress={onToggleShuffle}
                      aria-label="Toggle shuffle"
                    >
                      <Shuffle />
                    </Button>
                    <Button
                      isIconOnly
                      variant="light"
                      size="lg"
                      onPress={onPrevious}
                      isDisabled={!hasPrevious}
                      aria-label="Previous"
                    >
                      <SkipBack size={22} />
                    </Button>
                    <Button
                      isIconOnly
                      color="primary"
                      size="lg"
                      onPress={togglePlayPause}
                      isDisabled={isBuffering}
                      className="bg-blue-600 hover:bg-blue-700 shadow-2xl w-16 h-16"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isBuffering ? (
                        <i className="fa-solid fa-download fa-beat-fade" />
                      ) : isPlaying ? (
                        <Pause size={26} />
                      ) : (
                        <Play size={26} />
                      )}
                    </Button>
                    <Button
                      isIconOnly
                      variant="light"
                      size="lg"
                      onPress={onNext}
                      isDisabled={
                        !hasNext && !shuffleEnabled && repeatMode !== 1
                      }
                      aria-label="Next"
                    >
                      <SkipForward size={22} />
                    </Button>
                    <Button
                      isIconOnly
                      variant={repeatMode !== 0 ? "shadow" : "light"}
                      color={repeatMode !== 0 ? "primary" : "default"}
                      size="md"
                      onPress={onCycleRepeatMode}
                      aria-label="Cycle repeat mode"
                    >
                      {repeatMode === 2 ? <Repeat1 /> : <Repeat />}
                    </Button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-3">
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={toggleMute}
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <VolumeX /> : <Volume2 />}
                    </Button>
                    <Slider
                      aria-label="Volume"
                      size="sm"
                      step={0.01}
                      minValue={0}
                      maxValue={1}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-40"
                      classNames={{
                        track: "bg-gray-200 dark:bg-gray-700",
                        filler: "bg-blue-600",
                        thumb: "bg-blue-600",
                      }}
                    />
                  </div>

                  {/* Autoplay switch */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pt-2">
                    <span>Autoplay</span>
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
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom padding to prevent content from being hidden behind sticky player */}
      <div className="h-20" />
    </>
  );
}
