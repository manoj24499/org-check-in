-- Device details on every check-in/out attempt, and a log of automatic actions (see model AttendanceEvent).
ALTER TABLE "CheckInAttempt" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "CheckInAttempt" ADD COLUMN "platform" TEXT;
ALTER TABLE "CheckInAttempt" ADD COLUMN "osVersion" TEXT;
ALTER TABLE "CheckInAttempt" ADD COLUMN "deviceModel" TEXT;
ALTER TABLE "CheckInAttempt" ADD COLUMN "clientAction" TEXT;

CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceEvent_userId_createdAt_idx" ON "AttendanceEvent"("userId", "createdAt");
CREATE INDEX "AttendanceEvent_attendanceId_idx" ON "AttendanceEvent"("attendanceId");
CREATE INDEX "AttendanceEvent_kind_createdAt_idx" ON "AttendanceEvent"("kind", "createdAt");
