import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Atomic JSON file writes + a simple advisory file lock.
//
// The campaign index (data/campaigns/index.generated.json) and the active
// pointer (data/active-campaign.generated.json) are read-modify-write JSON
// files. Two concurrent "generate campaign" requests could otherwise:
//   - interleave and lose one another's index entry (lost update), or
//   - have a reader observe a half-written file (torn write).
//
// writeJsonAtomic() eliminates torn writes: it writes to a unique temp file,
// flushes it, then renames into place (atomic on POSIX / same-volume). Readers
// always see either the old or the new complete file.
//
// withFileLock() serialises the read-modify-write critical section so the
// lost-update race is eliminated too.
//
// LIMITATION — single-instance only. Both mechanisms are process/host-local.
// On a multi-instance Render deployment (or across the persistent disk shared
// by several instances) these locks do NOT coordinate between instances, and
// the atomic rename only holds within one filesystem. If the banner is ever
// scaled past one instance, move campaign index / active-pointer state into a
// database (or a row-locked store) instead of JSON files on disk.
// ─────────────────────────────────────────────────────────────────────────────

/** Write `data` as pretty JSON to `filePath` atomically (temp file + rename). */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`,
  );
  const body = JSON.stringify(data, null, 2) + "\n";
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(body, "utf8");
    // Best-effort durability before the rename. Some filesystems don't support
    // fsync on a file handle — treat that as non-fatal.
    try {
      await handle.sync();
    } catch {
      /* fsync unsupported — the rename below is still atomic */
    }
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Clean up the temp file if the rename failed, then rethrow.
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

export interface FileLockOptions {
  /** A lock file older than this (ms) is treated as abandoned and stolen. */
  staleMs?: number;
  /** Give up acquiring after this many ms. */
  timeoutMs?: number;
  /** Backoff between acquisition attempts (ms). */
  pollMs?: number;
}

/**
 * Run `fn` while holding an exclusive advisory lock at `lockPath`.
 *
 * Acquisition uses `open(..., "wx")` (exclusive create) — the OS guarantees
 * only one caller wins. A stale lock (older than staleMs, e.g. left by a
 * crashed process) is stolen. The lock is ALWAYS released in `finally`.
 */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  opts: FileLockOptions = {},
): Promise<T> {
  const staleMs = opts.staleMs ?? 15_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollMs ?? 50;

  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  // Acquire.
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx"); // fails EEXIST if held
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
          "utf8",
        );
      } finally {
        await handle.close();
      }
      break; // acquired
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Held by someone else — steal if stale.
      try {
        const st = await fs.stat(lockPath);
        if (Date.now() - st.mtimeMs > staleMs) {
          await fs.unlink(lockPath).catch(() => {});
          continue; // retry immediately after clearing the stale lock
        }
      } catch {
        // Lock vanished between open and stat — retry immediately.
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out after ${timeoutMs}ms acquiring lock: ${lockPath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  // Critical section — release in finally no matter what.
  try {
    return await fn();
  } finally {
    await fs.unlink(lockPath).catch(() => {});
  }
}
