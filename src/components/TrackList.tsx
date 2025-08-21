"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Play, Search, RefreshCw } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Spinner,
  Chip,
  Switch,
  Select,
  SelectItem,
} from "@heroui/react";
import Visualizer from "@/components/Visualizer";
import { Virtuoso } from "react-virtuoso";

interface TrackItem {
  id: string;
  name: string;
  size: number;
  title?: string;
  artist?: string;
  folder?: string;
  lastModified?: string;
  extension?: string;
}

interface TrackListProps {
  onTrackSelect: (track: TrackItem) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  onRootPathChange?: () => void;
}

export default function TrackList({
  onTrackSelect,
  currentTrackId,
  isPlaying,
  onRootPathChange,
}: TrackListProps) {
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const PAGE_SIZE = 300;
  const prefetchVersionRef = useRef(0);
  const [query, setQuery] = useState("");
  const [removePrefix, setRemovePrefix] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false;
      const saved = window.localStorage.getItem("trackList_removePrefix");
      if (saved === "1" || saved === "true") return true;
      if (saved === "0" || saved === "false") return false;
      return false;
    } catch {
      return false;
    }
  });
  type OrderBy = "title" | "artist" | "folder";
  const [orderBy, setOrderBy] = useState<OrderBy>(() => {
    try {
      if (typeof window === "undefined") return "title";
      const saved = window.localStorage.getItem("trackList_orderBy");
      if (saved === "artist" || saved === "folder" || saved === "title")
        return saved as OrderBy;
      return "title";
    } catch {
      return "title";
    }
  });

  type AlphaLetter =
    | "#"
    | "A"
    | "B"
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "I"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "O"
    | "P"
    | "Q"
    | "R"
    | "S"
    | "T"
    | "U"
    | "V"
    | "W"
    | "X"
    | "Y"
    | "Z";
  type AlphaKey = "all" | AlphaLetter;

  const lettersOnly: AlphaLetter[] = useMemo(
    () => [
      "#",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
    ],
    []
  );

  const navKeys: AlphaKey[] = useMemo(
    () => ["all", ...lettersOnly],
    [lettersOnly]
  );

  const [selectedLetter, setSelectedLetter] = useState<AlphaKey>(() => {
    try {
      if (typeof window === "undefined") return "all";
      const saved = window.localStorage.getItem("trackList_selectedLetter");
      if (
        saved === "all" ||
        saved === "#" ||
        (typeof saved === "string" && /^[A-Z]$/.test(saved))
      ) {
        return saved as AlphaKey;
      }
      return "all";
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    loadInitialFromCache();
  }, []);

  // Note: onRootPathChange is handled by the parent component
  // which will trigger a re-render and call loadFromCache when needed

  const normalizeText = (text: string): string => {
    return text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  };

  // Persist switch state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "trackList_removePrefix",
        removePrefix ? "1" : "0"
      );
    } catch {}
  }, [removePrefix]);

  // Persist orderBy selection
  useEffect(() => {
    try {
      window.localStorage.setItem("trackList_orderBy", orderBy);
    } catch {}
  }, [orderBy]);

  // Persist selected letter
  useEffect(() => {
    try {
      window.localStorage.setItem("trackList_selectedLetter", selectedLetter);
    } catch {}
  }, [selectedLetter]);

  const loadInitialFromCache = async () => {
    try {
      setLoading(true);
      setError(null);
      setTotal(null);
      setNextCursor(null);
      // bump prefetch version to cancel any ongoing background loads
      prefetchVersionRef.current += 1;
      const response = await fetch(`/api/music/cache?limit=${PAGE_SIZE}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
      setTotal(typeof data.total === "number" ? data.total : null);
      setNextCursor(
        typeof data.nextCursor === "number" ? data.nextCursor : null
      );
    } catch (err) {
      console.error("Failed to load cache:", err);
      setError(
        "Could not load cached tracks. Try scanning your library first."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadMoreFromCache = async () => {
    if (isLoadingMore || loadingAll) return;
    if (nextCursor === null) return;
    try {
      setIsLoadingMore(true);
      const response = await fetch(
        `/api/music/cache?limit=${PAGE_SIZE}&cursor=${nextCursor}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const newTracks: TrackItem[] = Array.isArray(data.tracks)
        ? data.tracks
        : [];
      setTracks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const t of newTracks) {
          if (!seen.has(t.id)) merged.push(t);
        }
        return merged;
      });
      setNextCursor(
        typeof data.nextCursor === "number" ? data.nextCursor : null
      );
      if (typeof data.total === "number") setTotal(data.total);
    } catch (err) {
      console.error("Failed to load more cache:", err);
      // do not set global error to avoid breaking current view
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Background prefetch of all remaining pages after initial load
  const prefetchAllRemaining = async (startCursor?: number | null) => {
    const myVersion = ++prefetchVersionRef.current;
    try {
      setLoadingAll(true);
      let cursor: number | null =
        typeof startCursor === "number" ? startCursor : nextCursor;
      while (typeof cursor === "number") {
        // cancelled by new load or unmount
        if (prefetchVersionRef.current !== myVersion) break;
        const response = await fetch(
          `/api/music/cache?limit=${PAGE_SIZE}&cursor=${cursor}`
        );
        if (!response.ok) break;
        const data = await response.json();
        const newTracks: TrackItem[] = Array.isArray(data.tracks)
          ? data.tracks
          : [];
        setTracks((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const merged = [...prev];
          for (const t of newTracks) {
            if (!seen.has(t.id)) merged.push(t);
          }
          return merged;
        });
        if (typeof data.total === "number") setTotal(data.total);
        const next =
          typeof data.nextCursor === "number" ? data.nextCursor : null;
        setNextCursor(next);
        cursor = next;
      }
    } catch {
      // ignore background errors
    } finally {
      if (prefetchVersionRef.current === myVersion) setLoadingAll(false);
    }
  };

  // Kick off background prefetch when initial page is available
  useEffect(() => {
    if (!loading && tracks.length > 0 && nextCursor !== null) {
      // do not await
      void prefetchAllRemaining(nextCursor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Cancel background prefetch on unmount
  useEffect(() => {
    return () => {
      prefetchVersionRef.current += 1;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return tracks;
    return tracks.filter((t) => {
      const hay = `${t.title || t.name} ${t.artist || ""} ${t.folder || ""}`;
      const hayNorm = normalizeText(hay);
      return hayNorm.includes(q);
    });
  }, [query, tracks]);

  const getDisplayTitle = (titleOrName: string): string => {
    if (!removePrefix) return titleOrName;
    const trimmed = titleOrName.trim();
    const firstSpace = trimmed.indexOf(" ");
    if (firstSpace === -1) return trimmed;
    return trimmed.slice(firstSpace + 1).trim();
  };

  const getFirstChar = (titleOrName: string): AlphaLetter => {
    const display = getDisplayTitle(titleOrName)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
    for (let i = 0; i < display.length; i += 1) {
      const ch = display[i];
      if (ch >= "A" && ch <= "Z") return ch as AlphaLetter;
      if (ch >= "0" && ch <= "9") return "#";
    }
    return "#";
  };

  const formatFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"] as const;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const letterCounts = useMemo(() => {
    const counts = Object.fromEntries(lettersOnly.map((l) => [l, 0])) as Record<
      AlphaLetter,
      number
    >;
    for (const t of filtered) {
      const ch = getFirstChar(t.title || t.name);
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return counts;
  }, [filtered, lettersOnly, removePrefix]);

  const alphaFiltered = useMemo(() => {
    if (selectedLetter === "all") return filtered;
    return filtered.filter(
      (t) => getFirstChar(t.title || t.name) === selectedLetter
    );
  }, [filtered, selectedLetter, removePrefix]);

  const sortedItems = useMemo(() => {
    const items = [...alphaFiltered];
    const compare = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base" });
    items.sort((a, b) => {
      const titleA = getDisplayTitle(a.title || a.name);
      const titleB = getDisplayTitle(b.title || b.name);
      const artistA = a.artist || "";
      const artistB = b.artist || "";
      const folderA = a.folder || "";
      const folderB = b.folder || "";
      if (orderBy === "artist") {
        const c = compare(artistA, artistB);
        if (c !== 0) return c;
        const ct = compare(titleA, titleB);
        if (ct !== 0) return ct;
        return compare(folderA, folderB);
      }
      if (orderBy === "folder") {
        const c = compare(folderA, folderB);
        if (c !== 0) return c;
        const ca = compare(artistA, artistB);
        if (ca !== 0) return ca;
        return compare(titleA, titleB);
      }
      const c = compare(titleA, titleB);
      if (c !== 0) return c;
      const ca = compare(artistA, artistB);
      if (ca !== 0) return ca;
      return compare(folderA, folderB);
    });
    return items;
  }, [alphaFiltered, orderBy, removePrefix]);

  if (loading) {
    return (
      <Card className="shadow-lg flex h-full">
        <CardBody className="p-6 overflow-auto h-full items-center justify-center">
          <div className="flex flex-col items-center justify-center">
            <Spinner size="lg" color="primary" />
            <span className="mt-2 text-gray-600 dark:text-gray-400">
              Loading contents...
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg flex h-full">
        <CardBody className="p-6 overflow-auto h-full items-center justify-center">
          <div className="flex flex-col items-center justify-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button
              onPress={loadInitialFromCache}
              startContent={<RefreshCw className="w-4 h-4" />}
            >
              Retry
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (tracks.length === 0) {
    return (
      <Card className="shadow-lg h-full">
        <CardBody className="p-6 h-full items-center justify-center">
          <div className="text-center">
            <Music className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No cached tracks found.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Run a scan in the Scanner panel to populate the cache.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg overflow-hidden w-full h-full flex flex-col">
      <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 w-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Track List ({alphaFiltered.length} / {total ?? tracks.length})
          </h2>
          <div className="flex flex-col gap-2 w-[620px] max-w-full">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-scissors" />
              <Switch
                isSelected={removePrefix}
                onValueChange={setRemovePrefix}
              />
              <i className="fa-solid fa-sort ms-2" />
              <Select
                size="sm"
                selectedKeys={new Set([orderBy])}
                onSelectionChange={(keys) => {
                  try {
                    const value = (keys as Set<string>).values().next()
                      .value as OrderBy;
                    if (value) setOrderBy(value);
                  } catch {}
                }}
                className="w-[160px]"
                aria-label="Order by"
              >
                <SelectItem key="title" textValue="Title">
                  Title
                </SelectItem>
                <SelectItem key="artist" textValue="Artist">
                  Artist
                </SelectItem>
                <SelectItem key="folder" textValue="Folder">
                  Folder
                </SelectItem>
              </Select>
              <Input
                size="sm"
                aria-label="Search tracks"
                placeholder="Search by title, artist, folder..."
                startContent={<Search className="w-4 h-4 text-gray-400" />}
                value={query}
                onValueChange={setQuery}
                isClearable
              />
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={loadInitialFromCache}
                startContent={<RefreshCw className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
        <div
          className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-1 justify-center min-w-max">
            {navKeys.map((key) => {
              const isAll = key === "all";
              const isSelected = selectedLetter === key;
              const count = isAll
                ? filtered.length
                : letterCounts[key as AlphaLetter] ?? 0;
              const isDisabled = !isSelected && !isAll && count === 0;
              return (
                <div key={key} className="shrink-0">
                  <Button
                    isIconOnly
                    size="sm"
                    variant={isSelected ? "solid" : "light"}
                    color={isSelected ? "primary" : "default"}
                    isDisabled={isDisabled}
                    onPress={() => setSelectedLetter(key)}
                  >
                    {isAll ? "All" : key}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardBody className="p-0 h-full flex-1 min-h-0">
        <Virtuoso
          style={{ height: "100%" }}
          data={sortedItems}
          overscan={400}
          endReached={() => {
            // Load more when close to end
            if (!isLoadingMore) {
              void loadMoreFromCache();
            }
          }}
          components={{
            Footer: () =>
              nextCursor !== null ? (
                <div className="py-3 flex items-center justify-center text-sm text-gray-500">
                  <Spinner size="sm" />
                  <span className="ml-2">Loading more...</span>
                </div>
              ) : null,
          }}
          itemContent={(index, t) => (
            <div
              className={`px-6 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                currentTrackId === t.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
              onClick={() => onTrackSelect(t)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {currentTrackId === t.id && isPlaying ? (
                      <Visualizer />
                    ) : (
                      <Play className="h-5 w-5 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        currentTrackId === t.id
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {getDisplayTitle(t.title || t.name)}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t.artist && (
                        <span className="text-blue-500 dark:text-blue-400">
                          {t.artist}
                        </span>
                      )}
                      {t.extension && (
                        <Chip size="sm" variant="flat" className="text-xs">
                          {t.extension}
                        </Chip>
                      )}
                      <span>{formatFileSize(t.size)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-400">#{index + 1}</div>
              </div>
            </div>
          )}
        />
      </CardBody>
    </Card>
  );
}
