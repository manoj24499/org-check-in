export interface PauseInterval {
  pausedAt: Date;
  resumedAt: Date | null;
}

/**
 * Milliseconds actually worked between a CHECK_IN and CHECK_OUT, excluding
 * any paused intervals. A still-open pause (resumedAt null) is treated as
 * ending at checkOut — the scan route also explicitly closes any open pause
 * at checkout, so this only matters for the (should-be-rare) case of
 * computing hours for a session that's still in progress.
 */
export function computeWorkedMs(checkIn: Date, checkOut: Date, pauses: PauseInterval[]): number {
  const totalMs = checkOut.getTime() - checkIn.getTime();
  const pausedMs = pauses.reduce((sum, p) => {
    const end = p.resumedAt ?? checkOut;
    return sum + Math.max(0, end.getTime() - p.pausedAt.getTime());
  }, 0);
  return Math.max(0, totalMs - pausedMs);
}
