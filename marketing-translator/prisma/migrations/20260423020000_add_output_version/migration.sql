-- CreateTable
CREATE TABLE "TranslationOutputVersion" (
    "id" SERIAL NOT NULL,
    "translationOutputId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "outputText" TEXT NOT NULL,
    "correctedTranslation" TEXT,
    "approved" BOOLEAN NOT NULL,
    "reviewNote" TEXT,
    "score" DOUBLE PRECISION,
    "issueCodesJson" TEXT,
    "triggeringReviewId" INTEGER,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationOutputVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationOutputVersion_translationOutputId_createdAt_idx" ON "TranslationOutputVersion"("translationOutputId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationOutputVersion_createdByUserId_idx" ON "TranslationOutputVersion"("createdByUserId");

-- CreateIndex
CREATE INDEX "TranslationOutputVersion_eventType_idx" ON "TranslationOutputVersion"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationOutputVersion_translationOutputId_versionNumber_key" ON "TranslationOutputVersion"("translationOutputId", "versionNumber");

-- AddForeignKey
ALTER TABLE "TranslationOutputVersion" ADD CONSTRAINT "TranslationOutputVersion_translationOutputId_fkey" FOREIGN KEY ("translationOutputId") REFERENCES "TranslationOutput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationOutputVersion" ADD CONSTRAINT "TranslationOutputVersion_triggeringReviewId_fkey" FOREIGN KEY ("triggeringReviewId") REFERENCES "TranslationReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationOutputVersion" ADD CONSTRAINT "TranslationOutputVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
