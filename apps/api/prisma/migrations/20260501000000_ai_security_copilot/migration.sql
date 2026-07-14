-- Module 5: AI Security Copilot — RAG store needs the pgvector extension
-- before any table references the `vector` type below.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AiProviderName" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'OLLAMA', 'OPENROUTER');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AiMessageStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiMemorySourceType" AS ENUM ('FINDING', 'RECON_FINDING', 'NOTE', 'EVIDENCE', 'CONVERSATION_MESSAGE', 'SCAN_TEMPLATE', 'TARGET', 'PROJECT', 'CUSTOM');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "provider" "AiProviderName",
    "model" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AiMessageStatus" NOT NULL DEFAULT 'COMPLETE',
    "provider" "AiProviderName",
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_call_logs" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- `embedding` is a raw pgvector column, added outside Prisma's own column
-- list below (Prisma's `Unsupported("vector(1536)")` type is intentionally
-- excluded from the generated Client — see PrismaAiMemoryRepository).
CREATE TABLE "ai_memory_chunks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceType" "AiMemorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_memory_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_workspaceId_projectId_idx" ON "ai_conversations"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_updatedAt_idx" ON "ai_conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_tool_call_logs_conversationId_createdAt_idx" ON "ai_tool_call_logs"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_memory_chunks_workspaceId_projectId_idx" ON "ai_memory_chunks"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "ai_memory_chunks_sourceType_sourceId_idx" ON "ai_memory_chunks"("sourceType", "sourceId");

-- CreateIndex
-- ivfflat approximate-nearest-neighbor index for cosine similarity search.
-- `lists = 100` is a reasonable default for a workspace-scale corpus (low
-- thousands to tens of thousands of chunks) — see pgvector docs "choosing
-- lists" for re-tuning if the corpus grows much larger. Cannot be expressed
-- in schema.prisma (no operator-class support), hence hand-written here.
CREATE INDEX "ai_memory_chunks_embedding_idx" ON "ai_memory_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_call_logs" ADD CONSTRAINT "ai_tool_call_logs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_call_logs" ADD CONSTRAINT "ai_tool_call_logs_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memory_chunks" ADD CONSTRAINT "ai_memory_chunks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memory_chunks" ADD CONSTRAINT "ai_memory_chunks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
