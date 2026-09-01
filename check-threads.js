import prisma from './lib/prisma.js';
async function run() {
  const t = await prisma.chatThread.findMany({ include: { quoteRequest: true } });
  console.log(JSON.stringify(t, null, 2));
  process.exit(0);
}
run().catch(console.error);
