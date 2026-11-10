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
 *
 * `segments` (optional): the session's WorkSegment timeline. Only matters for
 * HYBRID employees — TRANSIT time (travelling between office and home) is not
 * work, so it is subtracted too (net of any pause overlapping it, so nothing
 * is subtracted twice). Sessions with no TRANSIT segment (every OFFICE / WFH /
 * FIELD session) get exactly the same result as without it.
 */
export function computeWorkedMs(
  checkIn: Date,
  checkOut: Date,
  pauses: PauseInterval[],
  segments?: WorkSegmentInterval[],
): number {
  const totalMs = checkOut.getTime() - checkIn.getTime();
  const pausedMs = pauses.reduce((sum, p) => {
    const end = p.resumedAt ?? checkOut;
    return sum + Math.max(0, end.getTime() - p.pausedAt.getTime());
  }, 0);
  const transitMs =
    segments && segments.some((s) => s.mode === "TRANSIT")
      ? computeSegmentSplit(checkIn, checkOut, segments, pauses).transitMs
      : 0;
  return Math.max(0, totalMs - pausedMs - transitMs);
}

export interface WorkSegmentInterval {
  mode: "OFFICE" | "FIELD" | "HOME" | "TRANSIT";
  startedAt: Date;
  endedAt: Date | null;
}

export interface SegmentSplit {
  officeMs: number;
  fieldMs: number;
  homeMs: number;
  transitMs: number;
}

/**
 * Time per segment type (see WorkSegment), each net of any pause overlapping
 * it — each segment's pause overlap is subtracted the same way computeWorkedMs
 * subtracts pauses from the whole day. A still-open segment (endedAt null) is
 * treated as ending at checkOut, same precedent as a still-open pause. For a
 * FIELD employee officeMs + fieldMs equals computeWorkedMs; for a HYBRID one
 * officeMs + homeMs equals computeWorkedMs(…, segments) (transit excluded).
 */
export function computeSegmentSplit(
  checkIn: Date,
  checkOut: Date,
  segments: WorkSegmentInterval[],
  pauses: PauseInterval[],
): SegmentSplit {
  const split: SegmentSplit = { officeMs: 0, fieldMs: 0, homeMs: 0, transitMs: 0 };

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

    if (segment.mode === "OFFICE") split.officeMs += segmentMs;
    else if (segment.mode === "HOME") split.homeMs += segmentMs;
    else if (segment.mode === "TRANSIT") split.transitMs += segmentMs;
    else split.fieldMs += segmentMs;
  }

  return split;
}

/**
 * Splits a FIELD-workMode employee's worked time (see computeWorkedMs) into
 * field vs. office milliseconds, from their WorkSegment timeline (see
 * /api/kiosk/location's evaluateWorkSegment). fieldMs + officeMs always
 * equals computeWorkedMs's result for the same day. Kept as the FIELD-facing
 * view of computeSegmentSplit.
 */
export function computeFieldOfficeSplit(
  checkIn: Date,
  checkOut: Date,
  segments: WorkSegmentInterval[],
  pauses: PauseInterval[],
): { fieldMs: number; officeMs: number } {
  const { fieldMs, officeMs } = computeSegmentSplit(checkIn, checkOut, segments, pauses);
  return { fieldMs, officeMs };
}
