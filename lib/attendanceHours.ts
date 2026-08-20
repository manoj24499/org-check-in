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

export interface WorkSegmentInterval {
  mode: "OFFICE" | "FIELD";
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Splits a FIELD-workMode employee's worked time (see computeWorkedMs) into
 * field vs. office milliseconds, from their WorkSegment timeline (see
 * /api/kiosk/location's evaluateWorkSegment). fieldMs + officeMs always
 * equals computeWorkedMs's result for the same day — each segment's pause
 * overlap is subtracted the same way computeWorkedMs subtracts it from the
 * whole day. A still-open segment (endedAt null) is treated as ending at
 * checkOut, same precedent as a still-open pause.
 */
export function computeFieldOfficeSplit(
  checkIn: Date,
  checkOut: Date,
  segments: WorkSegmentInterval[],
  pauses: PauseInterval[],
): { fieldMs: number; officeMs: number } {
  let fieldMs = 0;
  let officeMs = 0;

  for (const segment of segments) {
    const start = segment.startedAt < checkIn ? checkIn : segment.startedAt;
    const rawEnd = segment.endedAt ?? checkOut;
    const end = rawEnd > checkOut ? checkOut : rawEnd;
    if (end <= start) continue;

    let segmentMs = end.getTime() - start.getTime();
    for (const pause of pauses) {
      const pauseStart = pause.pausedAt;
      const pauseEnd = pause.resumedAt ?? checkOut;
      const overlapStart = pauseStart > start ? pauseStart : start;
      const overlapEnd = pauseEnd < end ? pauseEnd : end;
      if (overlapEnd > overlapStart) {
        segmentMs -= overlapEnd.getTime() - overlapStart.getTime();
      }
    }
    segmentMs = Math.max(0, segmentMs);

    if (segment.mode === "OFFICE") officeMs += segmentMs;
    else fieldMs += segmentMs;
  }

  return { fieldMs, officeMs };
}
