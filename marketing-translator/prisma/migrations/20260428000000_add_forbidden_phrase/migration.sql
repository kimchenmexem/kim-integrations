-- CreateTable
CREATE TABLE "ForbiddenPhrase" (
    "id" SERIAL NOT NULL,
    "phrase" TEXT NOT NULL,
    "localeCode" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedByUserId" INTEGER,
    "triggeringReviewId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForbiddenPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForbiddenPhrase_localeCode_active_idx" ON "ForbiddenPhrase"("localeCode", "active");

-- CreateIndex
CREATE INDEX "ForbiddenPhrase_addedByUserId_idx" ON "ForbiddenPhrase"("addedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ForbiddenPhrase_localeCode_phrase_key" ON "ForbiddenPhrase"("localeCode", "phrase");

-- AddForeignKey
ALTER TABLE "ForbiddenPhrase" ADD CONSTRAINT "ForbiddenPhrase_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForbiddenPhrase" ADD CONSTRAINT "ForbiddenPhrase_triggeringReviewId_fkey" FOREIGN KEY ("triggeringReviewId") REFERENCES "TranslationReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
