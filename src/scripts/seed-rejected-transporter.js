/**
 * Seed a REJECTED transporter for testing the rejection → resubmit flow.
 *
 * Usage:
 *   pnpm tsx src/scripts/seed-rejected-transporter.js
 *
 * Login:
 *   rejected-transporter@test.local / Password123!
 */
import 'dotenv/config'
import { auth } from '../auth/auth.js'
import prisma from '../../lib/prisma.js'

const EMAIL = 'rejected-transporter@test.local'
const PASSWORD = 'Password123!'

const PORTUGAL = {
  latitude: 38.7223,
  longitude: -9.1393,
  country: 'Portugal',
  city: 'Lisbon',
  state: 'Lisbon',
  postalCode: '1000-001',
  zipCode: '1000-001',
  streetAddress: 'Rua da Rejeicao 42',
}

async function main() {
  console.log('Seeding rejected transporter...')

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (existing) {
    console.log(`User ${EMAIL} already exists (id=${existing.id}). Updating to REJECTED...`)

    await prisma.user.update({
      where: { id: existing.id },
      data: { status: 'SUSPENDED', role: 'TRANSPORTER', emailVerified: true },
    })

    await prisma.businessProfile.upsert({
      where: { userId: existing.id },
      create: {
        userId: existing.id,
        companyName: 'Rejected Transport Co',
        nifNumber: 'PT500999990',
        verificationStatus: 'REJECTED',
        rejectionReason: 'Insurance document is expired. | Invalid documents: insuranceDocumentUrl, transporterInsuranceUrl',
        ibanProofUrl: JSON.stringify(['/uploads/seed/iban-proof.pdf']),
        insuranceDocumentUrl: JSON.stringify(['/uploads/seed/insurance-expired.pdf']),
        transporterInsuranceUrl: JSON.stringify(['/uploads/seed/transporter-insurance-expired.pdf']),
        idDocumentUrl: JSON.stringify(['/uploads/seed/id-doc.pdf']),
        addressProofUrl: JSON.stringify(['/uploads/seed/address-proof.pdf']),
      },
      update: {
        verificationStatus: 'REJECTED',
        rejectionReason: 'Insurance document is expired. | Invalid documents: insuranceDocumentUrl, transporterInsuranceUrl',
        insuranceDocumentUrl: JSON.stringify(['/uploads/seed/insurance-expired.pdf']),
        transporterInsuranceUrl: JSON.stringify(['/uploads/seed/transporter-insurance-expired.pdf']),
      },
    })

    console.log('Updated existing user to SUSPENDED + REJECTED profile.')
    console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`)
    return
  }

  const result = await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: 'Rejected Transport Co', role: 'TRANSPORTER' },
  })
  const userId = result?.user?.id
  if (!userId) throw new Error('Failed to create user')

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'SUSPENDED', emailVerified: true, phoneNumber: '912999990' },
  })

  await prisma.businessProfile.create({
    data: {
      userId,
      companyName: 'Rejected Transport Co',
      nifNumber: 'PT500999990',
      verificationStatus: 'REJECTED',
      rejectionReason: 'Insurance document is expired. | Invalid documents: insuranceDocumentUrl, transporterInsuranceUrl',
      ibanProofUrl: JSON.stringify(['/uploads/seed/iban-proof.pdf']),
      insuranceDocumentUrl: JSON.stringify(['/uploads/seed/insurance-expired.pdf']),
      transporterInsuranceUrl: JSON.stringify(['/uploads/seed/transporter-insurance-expired.pdf']),
      idDocumentUrl: JSON.stringify(['/uploads/seed/id-doc.pdf']),
      addressProofUrl: JSON.stringify(['/uploads/seed/address-proof.pdf']),
    },
  })

  const address = await prisma.address.create({ data: PORTUGAL })
  await prisma.userAddressBridge.create({
    data: { userId, addressId: address.id, addressType: 'SHIPPING', isDefault: true },
  })

  await prisma.wallet.create({
    data: { userId, availableBalance: 200, pendingBalance: 0 },
  })

  console.log('\nDone!')
  console.log(`Login: ${EMAIL} / ${PASSWORD}`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
