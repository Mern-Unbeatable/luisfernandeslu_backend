import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();
async function main() {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(messages.map(m => ({ id: m.id, text: m.messageText, editedAt: m.editedAt })));
  await prisma.$disconnect();
}
main().catch(console.error);
