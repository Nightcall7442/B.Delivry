CREATE TYPE "PaymentPurpose" AS ENUM ('ORDER', 'PLUS', 'TIP');

ALTER TYPE "WalletTransactionType" ADD VALUE 'PAYMENT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'CASHBACK';
ALTER TYPE "WalletTransactionType" ADD VALUE 'TIP';
ALTER TYPE "WalletTransactionType" ADD VALUE 'REFERRAL';

ALTER TABLE "payments" DROP CONSTRAINT "payments_orderId_fkey";
ALTER TABLE "payments" ALTER COLUMN "orderId" DROP NOT NULL,
ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'ORDER',
ADD COLUMN "subject" TEXT;
UPDATE "payments" SET "subject" = "orderId";
ALTER TABLE "payments" ALTER COLUMN "subject" SET NOT NULL;
CREATE INDEX "payments_subject_idx" ON "payments"("subject");
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers" ADD COLUMN "plusUntil" TIMESTAMP(3),
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredById" TEXT,
ADD COLUMN "referralRewardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "customers_referralCode_key" ON "customers"("referralCode");
