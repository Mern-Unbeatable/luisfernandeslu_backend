import prisma from './lib/prisma.js';

async function run() {
  await prisma.chatMessage.deleteMany();
  await prisma.chatThreadParticipant.deleteMany();
  await prisma.chatThread.deleteMany();
  console.log('All chat data deleted!');
  process.exit(0);
}

run().catch(console.error);
