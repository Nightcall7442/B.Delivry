-- CreateEnum
CREATE TYPE "SubstitutionPolicy" AS ENUM ('CALL', 'REPLACE', 'REMOVE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "substitutionPolicy" "SubstitutionPolicy" NOT NULL DEFAULT 'CALL',
ADD COLUMN     "vendorComment" TEXT;
