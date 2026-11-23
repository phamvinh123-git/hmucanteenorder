import type { ReactNode } from "react";
import type { CourtKind } from "@/lib/court-kinds";

// A court drawn as a tilted 3D plane (CSS 3D transforms, no libraries): the markings are an SVG on the floor, and
// sports with a net get a net standing up across the middle. Hover lifts it, a selected court sways gently.

const LINE = "#fff";

type Art = { w: number; h: number; net: boolean; surface: ReactNode };

const ART: Record<CourtKind, Art> = {
  BADMINTON: {
    w: 100,
    h: 220,
    net: true,
    surface: (
      <>
        <rect width="100" height="220" fill="#157a63" />
        <rect x="8" y="12" width="84" height="196" fill="#22a085" />
        <g fill="none" stroke={LINE} strokeWidth="1.4">
          <rect x="8" y="12" width="84" height="196" />
          <line x1="14" y1="12" x2="14" y2="208" />
          <line x1="86" y1="12" x2="86" y2="208" />
          <line x1="8" y1="81" x2="92" y2="81" />
          <line x1="8" y1="139" x2="92" y2="139" />
          <line x1="50" y1="12" x2="50" y2="81" />
          <line x1="50" y1="139" x2="50" y2="208" />
          <line x1="8" y1="23" x2="92" y2="23" />
          <line x1="8" y1="197" x2="92" y2="197" />
        </g>
      </>
    ),
  },
  TABLE_TENNIS: {
    w: 100,
    h: 180,
    net: true,
    surface: (
      <>
        <rect width="100" height="180" fill="#0b2a6f" />
        <rect x="8" y="8" width="84" height="164" rx="3" fill="#1d4ed8" />
        <g fill="none" stroke={LINE} strokeWidth="1.6">
          <rect x="8" y="8" width="84" height="164" rx="3" />
          <line x1="50" y1="8" x2="50" y2="172" strokeWidth="1" />
        </g>
      </>
    ),
  },
  FOOTBALL: {
    w: 100,
    h: 150,
    net: false,
    surface: (
      <>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="0" y={i * 18.75} width="100" height="18.75" fill={i % 2 ? "#37b24d" : "#2f9e44"} />
        ))}
        <g fill="none" stroke={LINE} strokeWidth="1.4">
          <rect x="6" y="6" width="88" height="138" />
          <line x1="6" y1="75" x2="94" y2="75" />
          <circle cx="50" cy="75" r="12" />
          <rect x="28" y="6" width="44" height="22" />
          <rect x="28" y="122" width="44" height="22" />
          <rect x="40" y="6" width="20" height="9" />
          <rect x="40" y="135" width="20" height="9" />
        </g>
        <circle cx="50" cy="75" r="1.6" fill={LINE} />
      </>
    ),
  },
  BASKETBALL: {
    w: 100,
    h: 186,
    net: false,
    surface: (
      <>
        <rect width="100" height="186" fill="#a8693a" />
        <rect x="6" y="6" width="88" height="174" fill="#dba36b" />
        <g fill="none" stroke={LINE} strokeWidth="1.4">
          <rect x="6" y="6" width="88" height="174" />
          <line x1="6" y1="93" x2="94" y2="93" />
          <circle cx="50" cy="93" r="12" />
          <rect x="34" y="6" width="32" height="38" />
          <circle cx="50" cy="44" r="11" />
          <rect x="34" y="142" width="32" height="38" />
          <circle cx="50" cy="142" r="11" />
          <path d="M14 6 V30 A37 37 0 0 0 86 30 V6" />
          <path d="M14 180 V156 A37 37 0 0 1 86 156 V180" />
        </g>
        <circle cx="50" cy="13" r="3" fill="none" stroke="#f76707" strokeWidth="1.6" />
        <circle cx="50" cy="173" r="3" fill="none" stroke="#f76707" strokeWidth="1.6" />
      </>
    ),
  },
  PICKLEBALL: {
    w: 100,
    h: 190,
    net: true,
    surface: (
      <>
        <rect width="100" height="190" fill="#2b4c9b" />
        <rect x="8" y="10" width="84" height="170" fill="#3b82c4" />
        <g fill="none" stroke={LINE} strokeWidth="1.4">
          <rect x="8" y="10" width="84" height="170" />
          <line x1="8" y1="62" x2="92" y2="62" />
          <line x1="8" y1="128" x2="92" y2="128" />
          <line x1="50" y1="10" x2="50" y2="62" />
          <line x1="50" y1="128" x2="50" y2="180" />
        </g>
      </>
    ),
  },
  OTHER: {
    w: 100,
    h: 150,
    net: false,
    surface: (
      <>
        <rect width="100" height="150" fill="#2f9e44" />
        <g fill="none" stroke={LINE} strokeWidth="1.4">
          <rect x="6" y="6" width="88" height="138" />
          <line x1="6" y1="75" x2="94" y2="75" />
          <circle cx="50" cy="75" r="12" />
        </g>
      </>
    ),
  },
};

export default function Court3D({
  kind,
  selected = false,
  closed = false,
  size = 84,
}: {
  kind: CourtKind;
  selected?: boolean;
  closed?: boolean;
  /** Width of the court's floor in pixels. */
  size?: number;
}) {
  const art = ART[kind] ?? ART.OTHER;
  return (
    <div className={`court3d ${selected ? "is-selected" : ""} ${closed ? "is-closed" : ""}`} aria-hidden>
      <div className="court3d-stage">
        <div className="court3d-plane" style={{ width: size, height: (size * art.h) / art.w }}>
          <svg viewBox={`0 0 ${art.w} ${art.h}`} className="court3d-surface" preserveAspectRatio="none">
            {art.surface}
          </svg>
          {art.net && <div className="court3d-net" />}
        </div>
        <div className="court3d-shadow" />
      </div>
    </div>
  );
}
