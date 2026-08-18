import prisma from '../../../lib/prisma.js'
import { resolveAssignedTransporterId } from '../chat/rules.js'

export async function resolveTransporter(order, { includeVehicle = false } = {}) {
  const transporterId =
    order.shipment?.vehicle?.transporterId ||
    (await resolveAssignedTransporterId(order.id))

  if (order.shipment?.vehicle?.transporter) {
    const t = order.shipment.vehicle.transporter
    const mapped = {
      id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phoneNumber,
    }
    if (includeVehicle) {
      mapped.vehicle = order.shipment.vehicle.licensePlate
        ? `Truck #${order.shipment.vehicle.licensePlate}`
        : null
    }
    return mapped
  }

  if (!transporterId) return null

  const t = await prisma.user.findUnique({
    where: { id: transporterId },
    select: { id: true, name: true, email: true, phoneNumber: true },
  })
  if (!t) return null
  const mapped = {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phoneNumber,
  }
  if (includeVehicle) mapped.vehicle = null
  return mapped
}
