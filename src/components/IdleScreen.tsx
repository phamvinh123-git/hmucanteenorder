"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { titleFont } from "@/app/title-font";
import AnimatedTitle from "./AnimatedTitle";

// Cells per row: more than any screen needs (the extra ones are clipped), because the number that fit
// depends on the screen. Two rows per band.
const WAVE_COLS = 48;
const WAVE_ROWS = 2;

/** A strip of red and white cells along one edge whose colours and height ripple from left to right. */
function WaveBand({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 ${position === "top" ? "top-0" : "bottom-0"} overflow-hidden`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${WAVE_COLS}, var(--wave-cell))`,
        gap: "4px",
        padding: "4px 0 4px 4px",
        // Cell size follows the smaller side of the screen, within sensible limits.
        ["--wave-cell" as string]: "clamp(30px, 7vmin, 90px)",
      }}
    >
      {Array.from({ length: WAVE_ROWS * WAVE_COLS }, (_, i) => {
        const row = Math.floor(i / WAVE_COLS);
        const col = i % WAVE_COLS;
        const phase = (row + col) % 2;
        return (
          <div
            key={i}
            className="wave-cell"
            style={{ ["--c" as string]: col, ["--p" as string]: phase, ["--tone" as string]: phase ? "#ffffff" : "#be1651" }}
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

  if (!idle) return null;

  return (
    <div
      role="dialog"
      aria-label="Màn hình chờ"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4 text-center print:hidden"
      style={{ background: "linear-gradient(to bottom, #ffffff, #fdf2f6)" }}
    >
      {/* The same faint school-logo watermark the rest of the site has behind its pages. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{ background: 'url("/logo.webp") center / min(75vmin, 640px) no-repeat' }}
      />
      <WaveBand position="top" />
      <WaveBand position="bottom" />
      <div className="relative">
        <Image
          src="/logo.webp"
          alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
          width={160}
          height={160}
          className="mx-auto mb-6 h-36 w-36 rounded-full bg-white object-cover animate-logo-float sm:h-44 sm:w-44"
        />
        <AnimatedTitle
          title="HMU THC Canteen"
          subtitle="Hệ thống đặt ăn tại Canteen"
          fontClassName={titleFont.className}
          large
        />
      </div>
    </div>
  );
}
