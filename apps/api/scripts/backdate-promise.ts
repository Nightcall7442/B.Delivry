/** Dev helper: makes the newest order "late" so the late-delivery promise can be watched. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const latest = await prisma.order.findFirstOrThrow({ orderBy: { placedAt: 'desc' } });
const updated = await prisma.order.update({
  where: { id: latest.id },
  data: { promisedAt: new Date(Date.now() - 61 * 60_000) },
  select: { number: true, promisedAt: true, deliveryFee: true },
});
console.log(updated);
await prisma.$disconnect();
