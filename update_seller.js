import { PrismaClient } from './src/generated/prisma/index.js';
const prisma = new PrismaClient();
async function run() {
  await prisma.businessProfile.updateMany({
    where: { userId: 'IR7daYp7CZZU3vfMvbcFxjYpJ72iJQTP' },
    data: { eupagoExternKey: '784a-d91a-84bf-b28e-32e5' }
  });
  console.log('Done');
}
run().catch(console.error).finally(() => prisma.$disconnect());
