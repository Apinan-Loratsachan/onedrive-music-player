"use client";

import { useEffect, useRef, useState } from "react";

export default function Visualizer({ barCount = 5 }: { barCount?: number }) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 0.3)
  );
  const durationsRef = useRef<number[]>(
    Array.from({ length: barCount }, () => 150)
  );
  const timeoutsRef = useRef<Array<number | null>>(
    Array.from({ length: barCount }, () => null)
  );
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    const scheduleNext = (index: number) => {
      const nextDuration = Math.floor(200 + Math.random() * 200); // 0.2s - 0.4s
      durationsRef.current[index] = nextDuration;
      const nextLevel = 0.2 + Math.random() * 0.8; // 0.2 - 1.0
      setLevels((prev) => {
        const copy = prev.slice();
        copy[index] = nextLevel;
        return copy;
      });
      const id = window.setTimeout(() => {
        if (!unmountedRef.current) scheduleNext(index);
      }, nextDuration);
      timeoutsRef.current[index] = id as unknown as number;
    };

    for (let i = 0; i < barCount; i += 1) {
      const initialDelay = Math.floor(Math.random() * 50);
      const id = window.setTimeout(() => scheduleNext(i), initialDelay);
      timeoutsRef.current[i] = id as unknown as number;
    }

    return () => {
      unmountedRef.current = true;
      for (let i = 0; i < barCount; i += 1) {
        const id = timeoutsRef.current[i];
        if (id != null) window.clearTimeout(id as unknown as number);
        timeoutsRef.current[i] = null;
      }
    };
  }, [barCount]);

  return (
    <div className="h-5 w-5 flex items-end justify-center">
      <div className="flex items-end gap-[2px] h-[14px] w-[14px]">
        {levels.map((level, i) => (
          <span
            key={i}
            className="block w-[2px] h-full bg-blue-600 dark:bg-blue-400 rounded-[1px]"
            style={{
              transform: `scaleY(${Math.max(0.1, Math.min(1, level))})`,
              transformOrigin: "bottom center",
              transitionProperty: "transform",
              transitionDuration: `${durationsRef.current[i]}ms`,
              transitionTimingFunction: "ease-in-out",
            }}
          />
        ))}
      </div>
    </div>
  );
}
