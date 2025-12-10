/*
  Warnings:

  - A unique constraint covering the columns `[flowToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "flowOrder" INTEGER,
ADD COLUMN     "flowToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_flowToken_key" ON "Order"("flowToken");
