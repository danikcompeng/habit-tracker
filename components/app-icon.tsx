// Hold's icon, drawn in code (next/og turns it into a PNG): a bone-coloured
// key, sitting on its darker lip, on a persimmon field, with a check on it.
// The app's gesture in one picture. No text, so no font to load.
//
// Only inline styles and flexbox here: next/og supports a subset of CSS.

import { ICON_COLORS, type IconShape } from "@/lib/app-identity";

export function AppIcon({ size, shape }: { size: number; shape: IconShape }) {
  // Maskable icons are cropped by Android to a circle or squircle; the safe
  // area is the middle 80% circle, so the key stays well inside it.
  const key = Math.round(size * (shape === "maskable" ? 0.42 : 0.54));
  const lip = Math.round(key * 0.09);
  const radius = Math.round(key * 0.26);
  const check = Math.round(key * 0.62);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_COLORS.field,
        borderRadius: shape === "rounded" ? Math.round(size * 0.225) : 0,
      }}
    >
      {/* The key: its face on top of the lip; the pair (face + lip) is centred. */}
      <div style={{ display: "flex", position: "relative", width: key, height: key + lip }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: lip,
            width: key,
            height: key,
            borderRadius: radius,
            background: ICON_COLORS.lip,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: key,
            height: key,
            borderRadius: radius,
            background: ICON_COLORS.key,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={check} height={check} viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke={ICON_COLORS.check}
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
