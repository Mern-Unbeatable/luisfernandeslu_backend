import { createSplitPayment } from './src/modules/payments/eupago.client.js';

async function run() {
  try {
    const result = await createSplitPayment({
      paymentMethod: 'creditcard',
      amount: 15.50,
      identifier: 'TEST-CHK-1234',
      beneficiaries: [
        {
          externKey: '784a-d91a-84bf-b28e-32e5',
          amount: 15.50,
          identifier: 'TEST-CHK-1234-SELLER'
        }
      ]
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
