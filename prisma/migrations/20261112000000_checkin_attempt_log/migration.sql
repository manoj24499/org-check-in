-- Log of every check-in / check-out attempt, accepted or refused (see model CheckInAttempt).
CREATE TABLE "CheckInAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,
    "userId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reason" TEXT,
    "httpStatus" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mocked" BOOLEAN,
    "checkInMode" TEXT,
    "faceVerifyStatus" "FaceVerifyStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "faceSimilarity" DOUBLE PRECISION,
    "photo" BYTEA,
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "attendanceId" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "CheckInAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckInAttempt_createdAt_idx" ON "CheckInAttempt"("createdAt");
CREATE INDEX "CheckInAttempt_userId_createdAt_idx" ON "CheckInAttempt"("userId", "createdAt");
CREATE INDEX "CheckInAttempt_employeeCode_createdAt_idx" ON "CheckInAttempt"("employeeCode", "createdAt");
CREATE INDEX "CheckInAttempt_outcome_createdAt_idx" ON "CheckInAttempt"("outcome", "createdAt");
