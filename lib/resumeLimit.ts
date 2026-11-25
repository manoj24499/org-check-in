/** Most check-ins one employee can make in a day: the first one plus up to five more after check-outs. */
export const MAX_CHECKINS_PER_DAY = 6;
/** Most "resume" re-entries in a day (every check-in after the first). */
export const MAX_RESUMES_PER_DAY = MAX_CHECKINS_PER_DAY - 1;
