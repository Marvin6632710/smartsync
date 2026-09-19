import React from 'react'

/**
 * The mark.
 *
 * Two hooks, each ending in a head, curl into one another and make an S:
 * the initial of both halves of the name, and two people whose paths bend
 * toward each other and meet at the seam in the middle. The top hook is
 * ink and the bottom one the accent, so drawn on a page it takes the
 * page's own text and accent colours and follows the theme by itself. On
 * the tile — the app icon, the favicon, the header — it is cream and lilac
 * on ink at every size and on every ground, which is what an icon has to be.
 *
 * Decorative wherever it appears: the link or heading around it says the
 * name.
 */

// The tile does not follow the theme: an icon is the same on every ground.
const TILE = '#17130c'
const TILE_TOP = '#f3ede4'
const TILE_BOTTOM = '#8b84f3'

// Drawn in a 64-unit box; each hook is a 270° arc of radius 10.5, stroke
// 7.5, butt-capped so the seam at the centre is one clean vertical cut, with
// a head of radius 6.25 at its free end.
const TOP_HOOK = 'M42.5 21.5A10.5 10.5 0 1 0 32 32'
const BOTTOM_HOOK = 'M32 32A10.5 10.5 0 1 1 21.5 42.5'

function Hooks({ top, bottom }) {
  return (
    <>
      <path d={TOP_HOOK} fill="none" stroke={top} strokeWidth="7.5" />
      <circle cx="42.5" cy="21.5" r="6.25" fill={top} />
      <path d={BOTTOM_HOOK} fill="none" stroke={bottom} strokeWidth="7.5" />
      <circle cx="21.5" cy="42.5" r="6.25" fill={bottom} />
    </>
  )
}

export default function BrandMark({ size = 32, tile = false, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {tile ? (
        <>
          <rect width="64" height="64" rx="20" fill={TILE} />
          <g transform="translate(9 9) scale(0.71875)">
            <Hooks top={TILE_TOP} bottom={TILE_BOTTOM} />
          </g>
        </>
      ) : (
        <Hooks top="currentColor" bottom="var(--accent)" />
      )}
    </svg>
  )
}
