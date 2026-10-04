import { Be_Vietnam_Pro } from "next/font/google";

// A font drawn for Vietnamese, so every tone mark renders correctly (the default font lacks glyphs for them).
// Shared by the login title and the idle screen, which show the same branded heading.
export const titleFont = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["600", "800"], display: "swap" });
