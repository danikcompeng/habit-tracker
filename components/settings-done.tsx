"use client";

// Settings' Done: back to Today, but only once a "Tap to complete" save on
// its way has landed, so Today never draws the old setting (like Done on
// /habits, Feature 4).

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tapModeSaving } from "@/components/tap-mode-switch";
import { buttonClass } from "@/components/ui/button";

export function SettingsDone() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  // False once Settings is hidden (left by the back gesture while waiting):
  // then the wait ends without a second trip to Today.
  const showing = useRef(true);
  // Hidden routes stay alive (<Activity>): coming back shows a fresh Done.
  useLayoutEffect(() => {
    showing.current = true;
    return () => {
      showing.current = false;
      setWaiting(false);
    };
  }, []);
  return (
    <Link
      href="/"
      aria-disabled={waiting || undefined}
      onClick={(event) => {
        const save = tapModeSaving();
        if (!save && !waiting) return;
        event.preventDefault();
        if (waiting || !save) return;
        setWaiting(true);
        save.finally(() => {
          if (showing.current) router.push("/");
        });
      }}
      className={buttonClass("secondary", { size: "sm", block: false }, "min-w-24 shrink-0")}
    >
      {waiting ? "Saving…" : "Done"}
    </Link>
  );
}
