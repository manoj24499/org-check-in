-- "Resume work": reopening the same day after a check-out. See AttendanceResume in schema.prisma.
ALTER TABLE "AttendancePause" ADD COLUMN "isBreak" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AttendanceResume" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkOutAt" TIMESTAMP(3) NOT NULL,
    "checkOutPhoto" BYTEA,
    "checkOutOdometerKm" DOUBLE PRECISION,
    "checkOutFaceStatus" "FaceVerifyStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "resumedAt" TIMESTAMP(3) NOT NULL,
    "resumePhoto" BYTEA,
    "faceVerifyStatus" "FaceVerifyStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "faceSimilarity" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceResume_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceResume_attendanceId_key" ON "AttendanceResume"("attendanceId");
CREATE INDEX "AttendanceResume_userId_resumedAt_idx" ON "AttendanceResume"("userId", "resumedAt");

ALTER TABLE "AttendanceResume" ADD CONSTRAINT "AttendanceResume_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
