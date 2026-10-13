-- CreateTable
CREATE TABLE "ShiftReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReminder_userId_dayKey_kind_key" ON "ShiftReminder"("userId", "dayKey", "kind");

-- AddForeignKey
ALTER TABLE "ShiftReminder" ADD CONSTRAINT "ShiftReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
