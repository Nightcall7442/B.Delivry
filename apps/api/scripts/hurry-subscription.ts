/** Dev helper: moves the newest subscription's next run inside the lead window. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const latest = await prisma.cartSubscription.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
const updated = await prisma.cartSubscription.update({
  where: { id: latest.id },
  data: { nextRunAt: new Date(Date.now() + 60 * 60_000), active: true },
  select: { id: true, nextRunAt: true },
});
console.log(updated);
await prisma.$disconnect();
