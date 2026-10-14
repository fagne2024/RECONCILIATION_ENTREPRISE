-- CreateTable
CREATE TABLE "AutoProcessingModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePattern" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "processingSteps" JSONB NOT NULL,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "templateFile" TEXT,
    "reconciliationKeys" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
