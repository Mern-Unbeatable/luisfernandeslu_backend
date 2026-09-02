import { PrismaClient } from './src/generated/prisma/index.js';
async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({
    where: { role: 'SUPPLIER', name: { contains: 'Lisboa Materials' } }
  });
  if (!user) {
    console.log('Supplier not found!');
    process.exit(1);
  }
  const bp = await prisma.businessProfile.upsert({
    where: { userId: user.id },
    update: { eupagoExternKey: '784a-d91a-84bf-b28e-32e5' },
    create: { userId: user.id, eupagoExternKey: '784a-d91a-84bf-b28e-32e5' }
  });
  console.log('Updated supplier eupagoExternKey:', bp.eupagoExternKey);
}
main().catch(console.error).finally(() => process.exit(0));
