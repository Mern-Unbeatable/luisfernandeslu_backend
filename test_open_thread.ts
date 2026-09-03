import prisma from './lib/prisma.js';
import { openOrGetThread } from './src/modules/chat/threads.js';

async function check() {
  const products = await prisma.product.findMany({
    include: { seller: true }
  });
  const factoryProducts = products.filter(p => p.seller && p.seller.role.toLowerCase() === 'factory');
  if (factoryProducts.length === 0) {
    console.log("No factory products found.");
    return;
  }
  
  const product = factoryProducts[0];
  console.log("Product ID:", product.id);

  // Find a supplier
  const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
  console.log("Supplier ID:", supplier?.id);

  try {
    const thread = await openOrGetThread(
      { id: supplier.id, role: supplier.role },
      { type: 'FACTORY_SUPPLIER', productId: product.id }
    );
    console.log("Thread opened successfully:", thread.id);
  } catch (err) {
    console.error("Failed to open thread:", err.message, err.code);
  }
}
check();
