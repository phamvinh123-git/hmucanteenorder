"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { titleFont } from "@/app/title-font";
import AnimatedTitle from "./AnimatedTitle";

/** How long without any input before the idle screen takes over. */
const IDLE_MS = 3 * 60 * 1000;

// Anything that counts as someone being at the screen.
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Full-screen idle screen: the login screen's logo and title, centred, without the form. It appears after
 * three minutes without input and goes away on the next touch, click, key press or mouse movement.
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
    }, 5000);

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
