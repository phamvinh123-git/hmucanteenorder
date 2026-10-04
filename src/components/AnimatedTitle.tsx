"use client";

import { Fragment, useEffect, useState } from "react";

// Colours of the campus logo, used for the letters while they scamper in.
const RED = [190, 22, 81];
const BLUE = [5, 86, 162];
const mix = (t: number) => `rgb(${RED.map((c, i) => Math.round(c + (BLUE[i] - c) * t)).join(",")})`;

// Deterministic "random" so the server render and the browser agree on every letter's start position.
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Time, in ms, after which every letter has landed and the text is joined into one gradient line. */
const ASSEMBLE_AFTER_MS = 2200;

function Letters({ text, step }: { text: string; step: number }) {
  const chars = Array.from(text);
  const last = Math.max(chars.length - 1, 1);
  return (
    <>
      {chars.map((ch, i) =>
        ch === " " ? (
          <Fragment key={i}> </Fragment>
        ) : (
          <span
            key={i}
            className="letter-trot inline-block"
            style={
              {
                color: mix(i / last),
                animationDelay: `${(i * step).toFixed(3)}s`,
                // Each letter starts somewhere to the left, tilted, and trots/hops into place.
                "--sx": `${-Math.round(90 + rand(i, 1) * 260)}px`,
                "--sr": `${Math.round((rand(i, 2) - 0.5) * 90)}deg`,
              } as React.CSSProperties
            }
          >
            {ch}
          </span>
        ),
      )}
    </>
  );
}

/**
 * Login title. The letters trot in one by one, hopping, and after about two seconds they have all
 * landed: the line is then replaced by the same text in a red-to-blue gradient that sweeps left to right.
 */
export default function AnimatedTitle({
  title,
  subtitle,
  fontClassName,
  large = false,
}: {
  title: string;
  subtitle: string;
  fontClassName: string;
  /** Bigger type, for the full-screen idle screen. */
  large?: boolean;
}) {
  const [assembled, setAssembled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setAssembled(true), reduce ? 0 : ASSEMBLE_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <h1
        aria-label={title}
        className={`${fontClassName} whitespace-nowrap pb-1 font-extrabold leading-tight tracking-tight ${
          large ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"
        }`}
      >
        {assembled ? <span className="title-gradient">{title}</span> : <Letters text={title} step={0.05} />}
      </h1>
      <p
        aria-label={subtitle}
        className={`${fontClassName} mt-1 pb-1 font-bold uppercase tracking-wide ${large ? "text-lg sm:text-2xl" : "text-base sm:text-lg"}`}
      >
        {assembled ? <span className="title-gradient">{subtitle}</span> : <Letters text={subtitle} step={0.025} />}
      </p>
    </>
  );
}
