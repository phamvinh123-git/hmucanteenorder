"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { titleFont } from "@/app/title-font";
import AnimatedTitle from "./AnimatedTitle";

// One tile of the background: a white field with a red band across the middle, both edges of the band
// swaying like a sine wave (one full wave per tile height, so the tile repeats seamlessly in both directions).
// The tile is 200 wide: 50 of white, a 100-wide red band, 50 of white.
const WAVE_AMPLITUDE = 14;

function bandsTile() {
  const left: string[] = [];
  const right: string[] = [];
  for (let y = 0; y <= 100; y += 2) {
    const dx = WAVE_AMPLITUDE * Math.sin((y / 100) * Math.PI * 2);
    left.push(`${(50 + dx).toFixed(1)} ${y}`);
    right.unshift(`${(150 + dx).toFixed(1)} ${y}`);
  }
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 100' preserveAspectRatio='none'>" +
    "<rect width='200' height='100' fill='#ffffff'/>" +
    `<polygon points='${[...left, ...right].join(" ")}' fill='#be1651'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const BANDS = bandsTile();

/** Red and white bands with wavy edges rolling across the whole screen from left to right. */
function Sweep() {
  return <div aria-hidden className="sweep" style={{ backgroundImage: BANDS }} />;
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
      <Sweep />
      <div className="relative rounded-[2rem] bg-white/90 px-8 py-8 shadow-2xl ring-1 ring-red-100 backdrop-blur-sm sm:px-14 sm:py-10">
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
