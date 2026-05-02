CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "planType" TEXT NOT NULL DEFAULT 'FREE',
  "stripeCustomerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Script" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "length" INTEGER NOT NULL,
  "output" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Script_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Script_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Usage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Usage_userId_month_key" ON "Usage"("userId", "month");

CREATE TABLE IF NOT EXISTS "UserEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT,
  "event" TEXT NOT NULL,
  "path" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserEvent_userId_createdAt_idx" ON "UserEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserEvent_event_createdAt_idx" ON "UserEvent"("event", "createdAt");
