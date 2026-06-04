-- CreateTable
CREATE TABLE "Locale" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" SERIAL NOT NULL,
    "sourceTerm" TEXT NOT NULL,
    "targetTerm" TEXT NOT NULL,
    "localeCode" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "forbidden" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" SERIAL NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "textType" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "lengthConstraint" TEXT,
    "requiredTerms" TEXT,
    "forbiddenTerms" TEXT,
    "complianceNotes" TEXT,
    "campaignContext" TEXT,
    "outputCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationOutput" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "outputText" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "validation" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationReview" (
    "id" SERIAL NOT NULL,
    "outputId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "issueCodes" TEXT,
    "correctedTranslation" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationQualityReview" (
    "id" SERIAL NOT NULL,
    "translationOutputId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "reviewerModel" TEXT NOT NULL,
    "issuesJson" TEXT NOT NULL,
    "repairInstructions" TEXT,
    "hardCheckIssuesJson" TEXT,
    "reviewStage" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationQualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMemoryEntry" (
    "id" SERIAL NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "textType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRun" (
    "id" SERIAL NOT NULL,
    "inputText" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "finalAction" TEXT NOT NULL,
    "finalConfidence" DOUBLE PRECISION NOT NULL,
    "semanticResult" TEXT NOT NULL,
    "independentResult" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "finalText" TEXT NOT NULL,
    "issues" TEXT NOT NULL,
    "rewriteApplied" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySource" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regulator" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "localeScope" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "canonicality" TEXT NOT NULL,
    "parserKey" TEXT NOT NULL,
    "pollCadence" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "externalRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "language" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedBy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),

    CONSTRAINT "SourceDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceObligation" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "localeCode" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceRefsJson" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" SERIAL NOT NULL,
    "obligationId" INTEGER NOT NULL,
    "ruleType" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "localeCode" TEXT,
    "severity" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleBundle" (
    "id" SERIAL NOT NULL,
    "localeCode" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contentJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceRefsJson" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "supersededAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSyncRun" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggeredBy" TEXT NOT NULL,
    "documentsFetched" INTEGER NOT NULL DEFAULT 0,
    "versionsCreated" INTEGER NOT NULL DEFAULT 0,
    "diffsDetected" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "runLogJson" TEXT,

    CONSTRAINT "SourceSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalReviewTask" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignee" TEXT,
    "decision" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "LegalReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherSource" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "localeScope" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceClass" TEXT NOT NULL,
    "audienceType" TEXT NOT NULL,
    "ingestionMode" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "coverageFocus" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "authorityScore" INTEGER NOT NULL DEFAULT 50,
    "audienceIntentScore" INTEGER NOT NULL DEFAULT 50,
    "brandSafetyScore" INTEGER NOT NULL DEFAULT 70,
    "partnerPriority" INTEGER NOT NULL DEFAULT 50,
    "marketRelevanceScore" INTEGER NOT NULL DEFAULT 50,
    "funnelRolesJson" TEXT NOT NULL DEFAULT '[]',
    "includeTagsJson" TEXT,
    "includePathsJson" TEXT,
    "excludeTagsJson" TEXT,
    "excludePathsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherDocument" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "externalRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "language" TEXT,
    "section" TEXT,
    "tagsJson" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherSyncRun" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggeredBy" TEXT NOT NULL,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsFiltered" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "PublisherSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegulatorySource_code_key" ON "RegulatorySource"("code");

-- CreateIndex
CREATE INDEX "RegulatorySource_jurisdiction_idx" ON "RegulatorySource"("jurisdiction");

-- CreateIndex
CREATE INDEX "RegulatorySource_active_idx" ON "RegulatorySource"("active");

-- CreateIndex
CREATE INDEX "SourceDocument_active_idx" ON "SourceDocument"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_sourceId_externalRef_key" ON "SourceDocument"("sourceId", "externalRef");

-- CreateIndex
CREATE INDEX "SourceDocumentVersion_documentId_fetchedAt_idx" ON "SourceDocumentVersion"("documentId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocumentVersion_documentId_contentHash_key" ON "SourceDocumentVersion"("documentId", "contentHash");

-- CreateIndex
CREATE INDEX "ComplianceObligation_jurisdiction_status_idx" ON "ComplianceObligation"("jurisdiction", "status");

-- CreateIndex
CREATE INDEX "ComplianceObligation_localeCode_idx" ON "ComplianceObligation"("localeCode");

-- CreateIndex
CREATE INDEX "ComplianceRule_obligationId_idx" ON "ComplianceRule"("obligationId");

-- CreateIndex
CREATE INDEX "ComplianceRule_enabled_idx" ON "ComplianceRule"("enabled");

-- CreateIndex
CREATE INDEX "RuleBundle_localeCode_status_idx" ON "RuleBundle"("localeCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RuleBundle_localeCode_version_key" ON "RuleBundle"("localeCode", "version");

-- CreateIndex
CREATE INDEX "SourceSyncRun_sourceId_startedAt_idx" ON "SourceSyncRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "SourceSyncRun_status_idx" ON "SourceSyncRun"("status");

-- CreateIndex
CREATE INDEX "LegalReviewTask_status_kind_idx" ON "LegalReviewTask"("status", "kind");

-- CreateIndex
CREATE INDEX "LegalReviewTask_assignee_status_idx" ON "LegalReviewTask"("assignee", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherSource_code_key" ON "PublisherSource"("code");

-- CreateIndex
CREATE INDEX "PublisherSource_country_idx" ON "PublisherSource"("country");

-- CreateIndex
CREATE INDEX "PublisherSource_sourceClass_idx" ON "PublisherSource"("sourceClass");

-- CreateIndex
CREATE INDEX "PublisherSource_audienceType_idx" ON "PublisherSource"("audienceType");

-- CreateIndex
CREATE INDEX "PublisherSource_active_idx" ON "PublisherSource"("active");

-- CreateIndex
CREATE INDEX "PublisherDocument_sourceId_publishedAt_idx" ON "PublisherDocument"("sourceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherDocument_sourceId_externalRef_key" ON "PublisherDocument"("sourceId", "externalRef");

-- CreateIndex
CREATE INDEX "PublisherSyncRun_sourceId_startedAt_idx" ON "PublisherSyncRun"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "TranslationOutput" ADD CONSTRAINT "TranslationOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationReview" ADD CONSTRAINT "TranslationReview_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "TranslationOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationQualityReview" ADD CONSTRAINT "TranslationQualityReview_translationOutputId_fkey" FOREIGN KEY ("translationOutputId") REFERENCES "TranslationOutput"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RegulatorySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocumentVersion" ADD CONSTRAINT "SourceDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ComplianceObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSyncRun" ADD CONSTRAINT "SourceSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RegulatorySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherDocument" ADD CONSTRAINT "PublisherDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PublisherSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherSyncRun" ADD CONSTRAINT "PublisherSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PublisherSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
