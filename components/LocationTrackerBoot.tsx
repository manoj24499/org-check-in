"use client";

import { useEffect } from "react";
import { resumeTrackingIfActive } from "@/lib/locationTracker";

/** Mounted once in the root layout so an active tracking session survives a hard refresh. */
export default function LocationTrackerBoot() {
  useEffect(() => {
    resumeTrackingIfActive();
  }, []);

  return null;
}
