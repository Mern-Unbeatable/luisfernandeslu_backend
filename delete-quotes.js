import prisma from './lib/prisma.js';
async function run() {
  await prisma.quoteRequest.deleteMany();
  console.log('Quotes deleted');
  process.exit(0);
}
run().catch(console.error);
