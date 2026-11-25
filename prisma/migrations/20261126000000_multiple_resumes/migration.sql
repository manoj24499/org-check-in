-- Several check-ins a day: an employee can resume more than once, so AttendanceResume is no longer one-per-day.
DROP INDEX "AttendanceResume_attendanceId_key";
CREATE INDEX "AttendanceResume_attendanceId_idx" ON "AttendanceResume"("attendanceId");
