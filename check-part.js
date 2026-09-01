import prisma from './lib/prisma.js';
async function run() {
  const p = await prisma.chatThreadParticipant.findMany();
  console.log(JSON.stringify(p, null, 2));
  process.exit(0);
}
run().catch(console.error);
