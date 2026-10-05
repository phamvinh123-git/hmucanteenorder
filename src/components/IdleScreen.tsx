"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { titleFont } from "@/app/title-font";
import AnimatedTitle from "./AnimatedTitle";

// One vertical period of a wavy edge, as an image: the colour fills everything to the left of an S-shaped
// curve. Tiled downwards it gives the leading edge of a swell.
const edgeImage = (colour: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='M0 0H58C86 10 86 40 58 50C30 60 30 90 58 100H0Z' fill='${colour}'/></svg>`,
  )}")`;

type Swell = { main: string; foam: string; className: string };

// Red sweeps over white, then white sweeps over red, forever. "foam" is the paler edge running just ahead.
const SWELLS: Swell[] = [
  { main: "#be1651", foam: "#f4a6c1", className: "sweep-under" },
  { main: "#ffffff", foam: "#fce7ef", className: "sweep-over" },
];

/** Waves of red and white rolling across the whole screen from left to right, one after the other. */
function Sweep() {
  return (
    <div aria-hidden className="sweep">
      {SWELLS.map((w) => (
        <div key={w.main} className={`sweep-layer ${w.className}`}>
          <div className="sweep-solid" style={{ background: w.main }} />
          <div
            className="sweep-edge"
            style={{ left: "calc(100% + 5vw)", backgroundImage: edgeImage(w.foam), animationDelay: "-1.5s" }}
          />
          <div className="sweep-edge" style={{ left: "100%", backgroundImage: edgeImage(w.main) }} />
        </div>
      ))}
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
