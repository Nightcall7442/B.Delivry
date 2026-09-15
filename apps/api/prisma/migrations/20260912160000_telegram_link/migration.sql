ALTER TABLE "users" ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "telegramLinkCode" TEXT;

CREATE UNIQUE INDEX "users_telegramChatId_key" ON "users"("telegramChatId");
CREATE UNIQUE INDEX "users_telegramLinkCode_key" ON "users"("telegramLinkCode");
