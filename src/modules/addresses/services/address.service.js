import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

function mapAddress(bridge) {
  const a = bridge.address
  return {
    id: a.id,
    title: a.title,
    streetAddress: a.streetAddress,
    city: a.city,
    state: a.state,
    zipCode: a.zipCode,
    country: a.country,
    latitude: a.latitude,
    longitude: a.longitude,
    addressType: bridge.addressType,
    isDefault: bridge.isDefault,
    createdAt: a.createdAt,
  }
}

class AddressService {
  assertBuyer(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'customer' && role !== 'company') {
      throw httpError(
        'Only customer or company can manage addresses',
        403,
        'Forbidden',
      )
    }
    return role
  }

  async list(auth) {
    this.assertBuyer(auth)
    const bridges = await prisma.userAddressBridge.findMany({
      where: { userId: auth.id },
      include: { address: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })

    return {
      status: 200,
      body: {
        addresses: bridges.map(mapAddress),
        message: 'Addresses fetched',
      },
    }
  }

  async create(auth, body) {
    this.assertBuyer(auth)

    const addressType = body.addressType || 'SHIPPING'
    const isDefault = Boolean(body.isDefault)

    const result = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.userAddressBridge.updateMany({
          where: { userId: auth.id, addressType },
          data: { isDefault: false },
        })
      }

      const address = await tx.address.create({
        data: {
          title: body.title || null,
          streetAddress: body.streetAddress,
          city: body.city,
          state: body.state,
          zipCode: body.zipCode,
          country: body.country || 'Portugal',
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
        },
      })

      const bridge = await tx.userAddressBridge.create({
        data: {
          userId: auth.id,
          addressId: address.id,
          addressType,
          isDefault,
        },
        include: { address: true },
      })

      return bridge
    })

    return {
      status: 201,
      body: {
        address: mapAddress(result),
        message: 'Address created',
      },
    }
  }

  async update(auth, addressId, body) {
    this.assertBuyer(auth)

    const bridge = await prisma.userAddressBridge.findFirst({
      where: { userId: auth.id, addressId },
      include: { address: true },
    })
    if (!bridge) throw httpError('Address not found', 404, 'NotFound')

    const nextType = body.addressType || bridge.addressType

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.userAddressBridge.updateMany({
          where: {
            userId: auth.id,
            addressType: nextType,
            NOT: { addressId },
          },
          data: { isDefault: false },
        })
      }

      await tx.address.update({
        where: { id: addressId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.streetAddress != null
            ? { streetAddress: body.streetAddress }
            : {}),
          ...(body.city != null ? { city: body.city } : {}),
          ...(body.state != null ? { state: body.state } : {}),
          ...(body.zipCode != null ? { zipCode: body.zipCode } : {}),
          ...(body.country != null ? { country: body.country } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
          ...(body.longitude !== undefined
            ? { longitude: body.longitude }
            : {}),
        },
      })

      const bridgeUpdate = {}
      if (body.addressType) bridgeUpdate.addressType = body.addressType
      if (body.isDefault !== undefined) bridgeUpdate.isDefault = body.isDefault

      if (Object.keys(bridgeUpdate).length) {
        // composite PK — delete+create if type changes, else update
        if (body.addressType && body.addressType !== bridge.addressType) {
          await tx.userAddressBridge.delete({
            where: {
              userId_addressId_addressType: {
                userId: auth.id,
                addressId,
                addressType: bridge.addressType,
              },
            },
          })
          await tx.userAddressBridge.create({
            data: {
              userId: auth.id,
              addressId,
              addressType: body.addressType,
              isDefault:
                body.isDefault !== undefined
                  ? body.isDefault
                  : bridge.isDefault,
            },
          })
        } else {
          await tx.userAddressBridge.update({
            where: {
              userId_addressId_addressType: {
                userId: auth.id,
                addressId,
                addressType: bridge.addressType,
              },
            },
            data: bridgeUpdate,
          })
        }
      }

      return tx.userAddressBridge.findFirst({
        where: { userId: auth.id, addressId },
        include: { address: true },
      })
    })

    return {
      status: 200,
      body: {
        address: mapAddress(updated),
        message: 'Address updated',
      },
    }
  }

  async remove(auth, addressId) {
    this.assertBuyer(auth)

    const bridges = await prisma.userAddressBridge.findMany({
      where: { userId: auth.id, addressId },
    })
    if (!bridges.length) throw httpError('Address not found', 404, 'NotFound')

    await prisma.$transaction(async (tx) => {
      await tx.userAddressBridge.deleteMany({
        where: { userId: auth.id, addressId },
      })
      const stillLinked = await tx.userAddressBridge.count({
        where: { addressId },
      })
      const usedOnOrders = await tx.order.count({
        where: {
          OR: [
            { shippingAddressId: addressId },
            { billingAddressId: addressId },
          ],
        },
      })
      const usedOnCheckout = await tx.checkoutSession.count({
        where: {
          OR: [
            { shippingAddressId: addressId },
            { billingAddressId: addressId },
          ],
        },
      })
      if (!stillLinked && !usedOnOrders && !usedOnCheckout) {
        await tx.address.delete({ where: { id: addressId } })
      }
    })

    return {
      status: 200,
      body: {
        id: addressId,
        message: 'Address removed',
      },
    }
  }
}

export default new AddressService()
