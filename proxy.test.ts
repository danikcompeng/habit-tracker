import { describe, expect, it } from "vitest";
import { config, isPublicPath } from "./proxy";

// Next.js wraps the matcher in ^...$ itself; do the same here.
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsOn = (path: string) => matcher.test(path);

describe("proxy matcher", () => {
  it("runs on pages, so they need a login", () => {
    for (const path of ["/", "/habits", "/login", "/auth/confirm"]) {
      expect(runsOn(path), path).toBe(true);
    }
  });
  it("skips static files, the manifest and icons", () => {
    for (const path of [
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/maskable",
      "/apple-icon.png",
      "/robots.txt",
    ]) {
      expect(runsOn(path), path).toBe(false);
    }
  });
});

describe("isPublicPath", () => {
  it("lets /login and /auth/* through without a login", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
  });
  it("doesn't let lookalikes through", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/authority")).toBe(false);
    expect(isPublicPath("/habits")).toBe(false);
  });
});

describe("keepTimezoneCookie", () => {
  it("re-sets tz from the server for a year, and sets nothing without it", async () => {
    const { NextRequest, NextResponse } = await import("next/server");
    const { keepTimezoneCookie } = await import("./proxy");
    const withTz = new NextRequest("https://hold.example/", { headers: { cookie: "tz=America%2FToronto" } });
    const response = NextResponse.next();
    keepTimezoneCookie(withTz, response);
    const cookie = response.cookies.get("tz");
    expect(decodeURIComponent(cookie?.value ?? "")).toBe("America/Toronto");
    expect(cookie?.maxAge).toBe(60 * 60 * 24 * 365);

    const without = NextResponse.next();
    keepTimezoneCookie(new NextRequest("https://hold.example/"), without);
    expect(without.cookies.get("tz")).toBeUndefined();
  });
});

describe("the proxy skips every install file (built from the icon list, so a rename can't drift)", () => {
  it("never runs on the manifest or any icon", async () => {
    const { APP_ICONS, iconUrl } = await import("./lib/app-identity");
    for (const path of ["/manifest.webmanifest", ...APP_ICONS.map((icon) => iconUrl(icon).replace(/\?.*$/, ""))]) {
      expect(runsOn(path), path).toBe(false);
    }
  });
});
