/** How old a check-in/out saved on a phone (offline) may be when it reaches the server. */
export const OFFLINE_MAX_AGE_MINUTES = 6 * 60;
export const OFFLINE_MAX_AGE_MS = OFFLINE_MAX_AGE_MINUTES * 60 * 1000;
/** Tolerance for a phone clock that runs slightly ahead of the server. */
export const OFFLINE_FUTURE_SLACK_MS = 2 * 60 * 1000;
