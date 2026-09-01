import prisma from './lib/prisma.js';
async function run() {
  const msgs = await prisma.chatMessage.findMany();
  console.log(msgs);
  process.exit(0);
}
run().catch(console.error);
