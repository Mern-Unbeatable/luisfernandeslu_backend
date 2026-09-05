import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: 'ORD-MTJZGJC9-XCB-1' },
    select: { id: true, orderNumber: true, orderStatus: true, grandTotal: true }
  })
  console.log('Order:', order)

  if (!order) { console.log('Order not found'); return }

  const transporter = await prisma.user.findFirst({
    where: { email: 'transporter@test.local' },
    select: { id: true, email: true, role: true }
  })
  console.log('Transporter:', transporter)

  if (!transporter) { console.log('Transporter not found'); return }

  let shipment = await prisma.shipment.findUnique({
    where: { orderId: order.id },
    select: { id: true, orderId: true, vehicleId: true }
  })
  console.log('Existing shipment:', shipment)

  let vehicle = await prisma.vehicle.findFirst({
    where: { transporterId: transporter.id },
    select: { id: true, transporterId: true, vehicleType: true }
  })
  console.log('Vehicle:', vehicle)

  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        transporterId: transporter.id,
        vehicleType: 'BOX_TRUCK',
        licensePlate: 'TEMP-001',
        weightCapacityKg: 10000,
        volumeCapacityCubm: 20,
      },
      select: { id: true, transporterId: true, vehicleType: true }
    })
    console.log('Created vehicle:', vehicle)
  }

  if (!shipment) {
    shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        vehicleId: vehicle.id,
        pickupAddressText: 'Warehouse',
        deliveryAddressText: 'Delivery Address',
      },
      select: { id: true, orderId: true, vehicleId: true }
    })
    console.log('Created shipment:', shipment)
  } else {
    shipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: { vehicleId: vehicle.id },
      select: { id: true, orderId: true, vehicleId: true }
    })
    console.log('Updated shipment:', shipment)
  }

  const existingAuction = await prisma.shipmentAuction.findUnique({
    where: { shipmentId: shipment.id }
  })

  if (!existingAuction) {
    const auction = await prisma.shipmentAuction.create({
      data: {
        shipmentId: shipment.id,
        requiredVehicleType: vehicle.vehicleType,
        auctionStatus: 'ASSIGNED',
        bidStartPrice: 100,
        expiresAt: new Date(Date.now() + 86400000),
      }
    })

    const bid = await prisma.transporterBid.create({
      data: {
        auctionId: auction.id,
        transporterId: transporter.id,
        bidAmount: 100,
        estimatedDeliveryTime: '24h',
        status: 'ACCEPTED',
      }
    })
    console.log('Created auction + accepted bid:', { auctionId: auction.id, bidId: bid.id })
  } else {
    console.log('Auction already exists:', existingAuction.id)
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { orderStatus: 'ASSIGNED' }
  })
  console.log('Order status updated to ASSIGNED')
}

main().catch(console.error).finally(() => prisma.$disconnect())
