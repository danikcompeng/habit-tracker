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
