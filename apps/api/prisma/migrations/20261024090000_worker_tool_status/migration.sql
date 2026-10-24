-- What each worker found when it checked its pentest tools (existence,
-- executable bit, version flag). Additive and independent of other tables, so it
-- is safe wherever it sorts in the migration order.
CREATE TABLE IF NOT EXISTS "worker_tool_status" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "tools" JSONB NOT NULL,

    CONSTRAINT "worker_tool_status_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "worker_tool_status_workerName_key" ON "worker_tool_status"("workerName");
