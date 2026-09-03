import { io } from "socket.io-client";
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret'; // check env

async function test() {
  // 1. Find a supplier
  const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
  // 2. Find a factory product
  const product = await prisma.product.findFirst({
    where: { seller: { role: 'FACTORY' } }
  });

  console.log("Supplier:", supplier?.email);
  console.log("Product:", product?.id);

  if (!supplier || !product) {
    console.log("Missing supplier or product");
    return;
  }

  // 3. Generate token
  const token = sign(
    { id: supplier.id, role: supplier.role, email: supplier.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 4. Connect
  const socket = io("http://localhost:8080", {
    auth: { token }
  });

  socket.on("connect", () => {
    console.log("Connected to socket");
    socket.emit("chat:open", { type: 'FACTORY_SUPPLIER', productId: product.id }, (response) => {
      console.log("chat:open response:", response);
      process.exit(0);
    });
  });

  socket.on("chat:error", (err) => {
    console.error("chat:error", err);
    process.exit(1);
  });
}

test();
