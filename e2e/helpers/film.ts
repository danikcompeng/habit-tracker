// Records what the page shows, frame by frame, and turns it into video
// (after Bitewise's, meal-cost-tracker/e2e/helpers/film.ts).
//
// Playwright's own .webm is blurry (CSS size) and its frame timing uneven,
// and screenshots back to back manage only about 20 a second at 2x. So this
// uses Chrome's screencast: every frame the browser draws (up to 60 a
// second), as a JPEG at quality 92 with the time it was drawn. The browser
// must be launched at the phone's scale (--force-device-scale-factor=2, in
// e2e/record.config.ts), or the frames come out at CSS size. ffmpeg then
// stitches them into an H.264 .mp4 at 30 fps, each 1/30 s showing the frame
// on screen at that moment, so the video keeps the real pacing.
//
// One long, slow movement (Climb's scroll) would still judder: the browser
// draws about 57 of every 60 frames, so resampling to 30 fps repeats one
// here and skips one there. So `stepped` moves the page one step, takes a
// screenshot, and keeps it for exactly 1/30 s: every frame moves the same
// distance. The film's clock then carries on from there.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CDPSession, Page } from "@playwright/test";

type Frame = { file: string; t: number };

/** The video's frame rate. */
export const FPS = 30;
const FRAME_MS = 1000 / FPS;

/**
 * Where ffmpeg is: $FFMPEG_PATH, then `ffmpeg` on the PATH, then the
 * ffmpeg-static npm package if it's installed. null if none works.
 */
export async function findFfmpeg(): Promise<string | null> {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"];
  try {
    // A variable, so TypeScript doesn't insist the package is installed:
    // it's optional (npm install --no-save ffmpeg-static).
    const optional = "ffmpeg-static";
    const mod = (await import(optional)) as { default?: string };
    candidates.push(mod.default);
  } catch {
    // Not installed: fine.
  }
  for (const bin of candidates) {
    if (bin && spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0) return bin;
  }
  return null;
}

/** A JPEG's pixel size, from its header. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export class Film {
  private readonly frames: Frame[] = [];
  private readonly marks = new Map<string, number>();
  /** The film's clock runs ahead of the real one after a stepped stretch. */
  private offset = 0;
  private readonly startedAt = Date.now();
  private size: { width: number; height: number } | null = null;

  private constructor(
    private readonly cdp: CDPSession,
    private readonly dir: string,
  ) {}

  /** Starts recording `page`. Frames go into `dir` (emptied first). */
  static async roll(page: Page, dir: string, expected: { width: number; height: number }) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const film = new Film(await page.context().newCDPSession(page), dir);
    film.cdp.on("Page.screencastFrame", (frame) => {
      // Acknowledged at once, so the next frame comes; written as it arrives.
      void film.cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      const data = Buffer.from(frame.data, "base64");
      film.size ??= jpegSize(data);
      // The time the browser drew it (seconds, this machine's clock), on the film's clock.
      film.keep(data, (frame.metadata.timestamp ?? Date.now() / 1000) * 1000 + film.offset);
    });
    await film.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    // The first frame shows its size: the phone's, at 2x, or the browser wasn't launched at 2x.
    await expectSoon(() => film.size !== null, "Film: no frame from the screencast");
    if (film.size!.width !== expected.width || film.size!.height !== expected.height) {
      throw new Error(`Film: frames are ${film.size!.width}x${film.size!.height}, not ${expected.width}x${expected.height} (launch with --force-device-scale-factor)`);
    }
    return film;
  }

  private keep(data: Buffer, t: number) {
    const file = path.join(this.dir, `f${String(this.frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, data);
    this.frames.push({ file, t });
  }

  /**
   * For each of `steps` frames: runs `move(i)`, then takes a screenshot (at
   * 2x: the browser runs at 2x) and keeps it for exactly 1/30 s. A
   * screenshot always shows the page as it is now; a screencast frame can
   * be one drawn a moment before the move. The screencast pauses meanwhile.
   */
  async stepped(steps: number, move: (i: number) => Promise<void>) {
    await this.cdp.send("Page.stopScreencast");
    const start = Date.now() + this.offset;
    for (let i = 0; i < steps; i++) {
      await move(i);
      const { data } = await this.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
      this.keep(Buffer.from(data, "base64"), start + i * FRAME_MS);
    }
    // The film's clock carries on from the last stepped frame.
    this.offset = start + steps * FRAME_MS - Date.now();
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  }

  /** Remembers "now" (on the film's clock) under a name, to cut the video there later. */
  mark(name: string) {
    this.marks.set(name, Date.now() + this.offset);
  }

  /** The time saved under `name`, in ms since the recording started. */
  at(name: string): number {
    const t = this.marks.get(name);
    if (t === undefined) throw new Error(`Film: no mark called "${name}"`);
    return t - this.startedAt;
  }

  /** Stops recording; the mark "end" is now. */
  async stop() {
    this.mark("end");
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await this.cdp.detach().catch(() => {});
  }

  /** Frames drawn between two times (ms since the start), a second. */
  rate(from: number, to: number) {
    const n = this.frames.filter((f) => f.t >= this.startedAt + from && f.t < this.startedAt + to).length;
    return n / ((to - from) / 1000);
  }

  /**
   * The clip from `from` to `to` (ms since the start) as one frame per 1/30 s
   * slot: for each slot, the frame showing then (the last drawn at or before
   * it). Linked into a folder as 000000.jpg, 000001.jpg… so ffmpeg reads it
   * at exactly 30 fps. (ffmpeg's own "concat" list puts each picture on a
   * 1/25 s grid, which repeats or skips a frame every few at 30 fps.)
   */
  private slots(name: string, clips: { from: number; to: number }[]): { dir: string; seconds: number } {
    const dir = path.join(this.dir, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    let n = 0;
    // Clips one after another (a straight cut between them).
    for (const { from, to } of clips) {
      const start = this.startedAt + from;
      const count = Math.floor(((to - from) * FPS) / 1000);
      let i = 0;
      for (let k = 0; k < count; k++) {
        // A millisecond of slack: a stepped frame sits exactly on its slot.
        const at = start + k * FRAME_MS + 1;
        while (i + 1 < this.frames.length && this.frames[i + 1].t <= at) i++;
        fs.linkSync(this.frames[i].file, path.join(dir, `${String(n++).padStart(6, "0")}.jpg`));
      }
    }
    return { dir, seconds: n / FPS };
  }

  /**
   * Encodes stretches of the recording, cut one to the next, into an H.264
   * .mp4 at 30 fps, no audio. `fade` (a colour) fades in from it at the
   * start and out to it at the end, so a loop meets itself cleanly.
   */
  encode(ffmpeg: string, out: string, clips: { from: number; to: number }[], { fade }: { fade?: string } = {}) {
    if (this.frames.length === 0) throw new Error("Film: no frames captured");
    const part = this.slots(path.basename(out, ".mp4"), clips);
    const filters: string[] = [];
    if (fade) {
      const outAt = Math.max(0, part.seconds - 0.4).toFixed(3);
      filters.push(`fade=t=in:d=0.4:color=${fade}`, `fade=t=out:st=${outAt}:d=0.4:color=${fade}`);
    }
    filters.push("format=yuv420p");
    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-framerate", String(FPS), "-i", path.join(part.dir, "%06d.jpg"),
      "-vf", filters.join(","),
      // H.264 at constant quality: sharp text and pixel art, playable everywhere.
      "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-tune", "animation",
      "-profile:v", "high", "-r", String(FPS), "-movflags", "+faststart", "-an",
      out,
    ];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`ffmpeg failed for ${out}:\n${result.stderr}`);
    return { seconds: part.seconds };
  }
}

async function expectSoon(ok: () => boolean, message: string) {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!ok()) throw new Error(message);
}
