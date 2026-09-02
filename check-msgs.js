import prisma from './src/lib/prisma.ts';

async function main() {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(messages.map(m => ({ id: m.id, text: m.messageText, editedAt: m.editedAt, isDeleted: m.isDeleted })));
  await prisma.$disconnect();
}

main().catch(console.error);
