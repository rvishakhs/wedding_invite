import { useId } from "react";

/** Layered vector jewellery: bevelled bands and cut stones, never photography. */
export function Rings({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const gold = `url(#${id}-gold)`;
  const edge = `url(#${id}-edge)`;
  const stone = `url(#${id}-stone)`;
  return (
    <svg className={className} viewBox="0 0 300 200" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.3" y2="1">
          <stop stopColor="#8b6025" /><stop offset=".22" stopColor="#ead39b" />
          <stop offset=".4" stopColor="#fff1bf" /><stop offset=".55" stopColor="#c99b45" />
          <stop offset=".8" stopColor="#a8752d" /><stop offset="1" stopColor="#e5c57b" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x2="1" y2=".6">
          <stop stopColor="#fff5ce" /><stop offset=".4" stopColor="#b28439" />
          <stop offset=".65" stopColor="#fff0b7" /><stop offset="1" stopColor="#926426" />
        </linearGradient>
        <radialGradient id={`${id}-stone`}>
          <stop stopColor="#fff" /><stop offset=".5" stopColor="#e5e1d5" />
          <stop offset=".8" stopColor="#fffef5" /><stop offset="1" stopColor="#b5a58a" />
        </radialGradient>
      </defs>
      <g transform="rotate(16 193 120)">
        <ellipse cx="193" cy="120" rx="79" ry="48" stroke="#8b672e" strokeWidth="17" />
        <ellipse cx="193" cy="117" rx="79" ry="48" stroke={gold} strokeWidth="14" />
        <ellipse cx="193" cy="112" rx="79" ry="48" stroke={edge} strokeWidth="3" />
        <path d="M114 120c0 27 35 48 79 48s79-21 79-48v13c0 27-35 48-79 48s-79-21-79-48Z" fill={gold} />
        <path d="M115 124c7 24 39 43 78 43s71-19 78-43" stroke={edge} strokeWidth="2" />
        <circle cx="192" cy="168" r="17" fill={stone} stroke={edge} strokeWidth="3" />
        <path d="m192 152 7 11 9 5-11 6-5 10-6-11-10-5 11-6Z" fill="#fffdf3" stroke="#b6a78a" strokeWidth=".7" />
        <path d="m181 157 22 22m0-22-22 22m11-27v34m-17-17h34" stroke="#b9ad94" strokeWidth=".7" />
      </g>
      <g transform="rotate(-23 100 91)">
        <ellipse cx="100" cy="91" rx="78" ry="43" stroke="#92703d" strokeWidth="10" />
        <ellipse cx="100" cy="88" rx="78" ry="43" stroke={gold} strokeWidth="10" />
        <ellipse cx="100" cy="85" rx="78" ry="43" stroke={edge} strokeWidth="2" />
        <path d="M23 91c3 23 36 42 77 42s74-19 77-42" stroke={gold} strokeWidth="10" />
        <path d="M24 89c3 23 35 40 76 40s73-17 76-40" stroke="#f8e5aa" strokeWidth="1.8" />
        <circle cx="98" cy="130" r="25" fill={stone} stroke={edge} strokeWidth="3" />
        <path d="m98 106 9 14 15 10-15 9-9 15-10-15-14-9 14-10Z" fill="#fffdf5" stroke="#b4a58c" />
        <path d="m81 113 34 34m0-34-34 34m17-41v48m-24-24h48m-33-10 18 19m0-19-19 19" stroke="#ac9f8c" strokeWidth=".8" />
        <path d="m98 120 9 10-9 9-10-9Z" fill="#e1dbcf" stroke="#fff" />
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <circle key={angle} cx="98" cy="105" r="3.5" transform={`rotate(${angle} 98 130)`} fill={gold} stroke="#e8ce8d" />
        ))}
      </g>
    </svg>
  );
}
