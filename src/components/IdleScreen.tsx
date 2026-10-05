"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { titleFont } from "@/app/title-font";
import AnimatedTitle from "./AnimatedTitle";

const WAVE_GAP = 4;
// How long the wave takes to run from the left edge to the right edge, and how far a cell's start is nudged
// up or down by its row so that the front is wavy instead of a straight line.
const WAVE_TRAVEL_S = 5;
const WAVE_RIPPLE_S = 0.5;

type WaveGrid = { cell: number; cols: number; rows: number };

/** How many cells it takes to cover the window (cell size follows the smaller side, within limits). */
function measureWaveGrid(): WaveGrid {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cell = Math.round(Math.min(110, Math.max(40, Math.min(w, h) * 0.075)));
  return { cell, cols: Math.ceil(w / (cell + WAVE_GAP)) + 1, rows: Math.ceil(h / (cell + WAVE_GAP)) + 1 };
}

/** Hidden red and white cells that appear column by column from left to right, alternating in both directions. */
function WaveField({ grid }: { grid: WaveGrid }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${grid.cols}, ${grid.cell}px)`,
        gridAutoRows: `${grid.cell}px`,
        gap: WAVE_GAP,
        padding: WAVE_GAP,
      }}
    >
      {Array.from({ length: grid.cols * grid.rows }, (_, i) => {
        const row = Math.floor(i / grid.cols);
        const col = i % grid.cols;
        const delay = (col / grid.cols) * WAVE_TRAVEL_S + (Math.sin(row * 0.7) + 1) * 0.5 * WAVE_RIPPLE_S;
        return (
          <div
            key={i}
            className="wave-cell"
            style={{
              ["--tone" as string]: (row + col) % 2 ? "#ffffff" : "#be1651",
              animationDelay: `${delay.toFixed(2)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/** How long without any input before the idle screen takes over. */
const IDLE_MS = 45 * 1000;

// Anything that counts as someone being at the screen.
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Full-screen idle screen: the login screen's logo and title, centred, without the form. It appears after
 * 45 seconds without input and goes away on the next touch, click, key press or mouse movement.
 */
export default function IdleScreen() {
  const [idle, setIdle] = useState(false);
  const [grid, setGrid] = useState<WaveGrid | null>(null);
  const lastActivity = useRef(0);
  const idleRef = useRef(false);

  useEffect(() => {
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;
    lastActivity.current = Date.now();

    const onActivity = (e: Event) => {
      lastActivity.current = Date.now();
      if (!idleRef.current) return;
      // A click/tap that wakes the screen must not also press whatever button lies underneath it,
      // so a pointer or touch press leaves the overlay up for a moment to swallow the rest of the click.
      const press = e.type === "pointerdown" || e.type === "touchstart";
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(
        () => {
          idleRef.current = false;
          setIdle(false);
        },
        press ? 300 : 0,
      );
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const check = setInterval(() => {
      if (!idleRef.current && Date.now() - lastActivity.current >= IDLE_MS) {
        idleRef.current = true;
        setIdle(true);
      }
    }, 1000);

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      clearInterval(check);
      clearTimeout(wakeTimer);
    };
  }, []);

  // The grid is measured when the idle screen opens and again whenever the window is resized.
  useEffect(() => {
    if (!idle) return;
    const update = () => setGrid(measureWaveGrid());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [idle]);

  if (!idle) return null;

  return (
    <div
      role="dialog"
      aria-label="Màn hình chờ"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4 text-center print:hidden"
      style={{ background: "linear-gradient(to bottom, #fbe4ed, #f6d3e1)" }}
    >
      {grid && <WaveField grid={grid} />}
      {/* No panel: the cells run right through behind the logo and title. A soft white glow and halos keep them readable. */}
      <div
        className="relative px-8 py-8 sm:px-14 sm:py-10"
        style={{
          background:
            "radial-gradient(ellipse closest-side, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.55) 60%, rgba(255,255,255,0) 100%)",
        }}
      >
        <Image
          src="/logo.webp"
          alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
          width={160}
          height={160}
          className="mx-auto mb-6 h-36 w-36 rounded-full bg-white object-cover shadow-[0_8px_30px_rgba(190,22,81,0.45)] ring-[6px] ring-white animate-logo-float sm:h-44 sm:w-44"
        />
        <div className="[filter:drop-shadow(0_0_2px_#fff)_drop-shadow(0_0_6px_#fff)_drop-shadow(0_0_14px_#fff)]">
          <AnimatedTitle
            title="HMU THC Canteen"
            subtitle="Hệ thống đặt ăn tại Canteen"
            fontClassName={titleFont.className}
            large
          />
        </div>
      </div>
    </div>
  );
}
