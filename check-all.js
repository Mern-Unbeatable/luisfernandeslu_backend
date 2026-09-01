import prisma from './lib/prisma.js';
async function run() {
  const threads = await prisma.chatThread.findMany();
  console.log(threads);
  const msgs = await prisma.chatMessage.findMany();
  console.log(msgs);
  process.exit(0);
}
run().catch(console.error);
