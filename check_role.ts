import prisma from './lib/prisma.js';

async function check() {
  const products = await prisma.product.findMany({
    include: { seller: true }
  });
  console.log("Found products:", products.length);
  const factoryProducts = products.filter(p => p.seller && p.seller.role.toLowerCase() === 'factory');
  console.log("Products sold by 'factory':", factoryProducts.length);
  if (products.length > 0) {
    console.log("Sample product seller role:", products[0].seller?.role);
  }
}
check();
