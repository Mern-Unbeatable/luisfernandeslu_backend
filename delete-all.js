import prisma from './lib/prisma.js';
async function run() {
  await prisma.quoteRequest.deleteMany();
  await prisma.chatThread.deleteMany();
  await prisma.chatThreadParticipant.deleteMany();
  await prisma.chatMessage.deleteMany();
  console.log('All deleted');
  process.exit(0);
}
run().catch(console.error);
