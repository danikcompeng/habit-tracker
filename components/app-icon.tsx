// Ascend's icon, "Summit", drawn in code (next/og turns it into a PNG): a
// bone-coloured mountain on a persimmon field, with a trail cut up its face.
// No text, so no font to load. The points are in lib/app-identity.ts
// (SUMMIT, summitPoints), where the maskable safe zone is tested.
//
// Only inline styles and flexbox here: next/og supports a subset of CSS.

import { ICON_COLORS, summitPoints, type IconShape, type Point } from "@/lib/app-identity";

/** An SVG path for a closed polygon: "M x y L x y ... Z". */
const polygonPath = (points: readonly Point[]) =>
  `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

export function AppIcon({ size, shape }: { size: number; shape: IconShape }) {
  const { mountain, trail } = summitPoints(shape);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        background: ICON_COLORS.field,
        // The tab icon's field is a rounded square; the mark itself is never rounded.
        borderRadius: shape === "rounded" ? Math.round(size * 0.225) : 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/*
          One shape: the mountain with the trail as a hole (even-odd), so the
          trail is exactly the field colour, with no seam where it meets the
          base. No stroke, so every corner stays sharp.
        */}
        <path d={`${polygonPath(mountain)} ${polygonPath(trail)}`} fill={ICON_COLORS.mark} fillRule="evenodd" />
      </svg>
    </div>
  );
}
