-- AlterTable
ALTER TABLE "GlossaryTerm" ADD COLUMN     "createdByUserId" INTEGER;

-- AlterTable
ALTER TABLE "TranslationJob" ADD COLUMN     "createdByUserId" INTEGER;

-- AlterTable
ALTER TABLE "TranslationReview" ADD COLUMN     "reviewerUserId" INTEGER;

-- AlterTable
ALTER TABLE "TranslationMemoryEntry" ADD COLUMN     "createdByUserId" INTEGER;

-- AlterTable
ALTER TABLE "DemoRun" ADD COLUMN     "createdByUserId" INTEGER;

-- CreateIndex
CREATE INDEX "GlossaryTerm_createdByUserId_idx" ON "GlossaryTerm"("createdByUserId");

-- CreateIndex
CREATE INDEX "TranslationJob_createdByUserId_idx" ON "TranslationJob"("createdByUserId");

-- CreateIndex
CREATE INDEX "TranslationReview_reviewerUserId_idx" ON "TranslationReview"("reviewerUserId");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_createdByUserId_idx" ON "TranslationMemoryEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "DemoRun_createdByUserId_idx" ON "DemoRun"("createdByUserId");

-- AddForeignKey
ALTER TABLE "GlossaryTerm" ADD CONSTRAINT "GlossaryTerm_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationJob" ADD CONSTRAINT "TranslationJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationReview" ADD CONSTRAINT "TranslationReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
