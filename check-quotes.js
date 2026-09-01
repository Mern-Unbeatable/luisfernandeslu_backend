import prisma from './lib/prisma.js';
async function run() {
  const quotes = await prisma.quoteRequest.findMany({ include: { chatThread: true } });
  console.log(JSON.stringify(quotes, null, 2));
  process.exit(0);
}
run().catch(console.error);
