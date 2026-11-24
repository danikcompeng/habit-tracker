"use client";

// Keeps Today on today (plans/habit-tracker.md, Feature 3, "Day rollover").
//
// - Every time the app comes back to the foreground, Today reloads its
//   data: picks up a new day after the phone slept, changes made on another
//   device, and a demo reset by someone else.
// - While it stays open, it reloads when the DEVICE's date changes (checked
//   every 2 s, which is cheap: it only reads the clock). It never compares with the server's date, so a phone with a
//   wrong clock can't make it reload over and over.
// - It writes the timezone cookie first, so the reload uses the right day.
// - Never in the middle of a hold: a reload that has to wait is kept and
//   done as soon as the hold ends.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveTimezoneCookie } from "@/components/timezone-sync";
import { todayIn } from "@/lib/dates";

const CHECK_EVERY_MS = 2_000;
const AT_MOST_EVERY_MS = 2_000;

function deviceToday(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function DayWatcher({ isHolding }: { isHolding: () => boolean }) {
  const router = useRouter();
  const holding = useRef(isHolding);
  useEffect(() => {
    holding.current = isHolding;
  });

  useEffect(() => {
    let lastDay = deviceToday();
    let lastRefresh = Date.now();
    // A reload that was wanted during a hold, done once the hold ends.
    let pending = false;

    function reload() {
      if (holding.current()) {
        pending = true;
        return;
      }
      const now = Date.now();
      // Focus and visibilitychange arrive together on return: one reload.
      if (now - lastRefresh < AT_MOST_EVERY_MS) return;
      pending = false;
      lastRefresh = now;
      saveTimezoneCookie();
      router.refresh();
    }
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    function checkDate() {
      const day = deviceToday();
      if (day !== lastDay) {
        lastDay = day;
        pending = true;
      }
      if (pending) reload();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", reload);
    window.addEventListener("pageshow", reload);
    const timer = setInterval(checkDate, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", reload);
      window.removeEventListener("pageshow", reload);
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
