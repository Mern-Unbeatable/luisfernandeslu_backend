import prisma from './lib/prisma.js';

async function run() {
  const threads = await prisma.chatThread.findMany({
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    take: 1
  });
  console.log(JSON.stringify(threads, null, 2));
  await prisma.$disconnect();
}
run();
