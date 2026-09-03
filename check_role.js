const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const products = await prisma.product.findMany({
    where: { category: { slug: { contains: 'factory', mode: 'insensitive' } } },
    include: { seller: true }
  });
  console.log("Found products:", products.length);
  if (products.length > 0) {
    console.log("Sample product seller role:", products[0].seller.role);
  }
}
check();
