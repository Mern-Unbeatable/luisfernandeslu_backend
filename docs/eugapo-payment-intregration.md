1. For Mock Payments (Current State)

env
PAYMENT_PROVIDER=mock
# No API keys required, it will automatically fake the successful payment flow!
2. For Sandbox / Testing (When you get the testing keys)

env
PAYMENT_PROVIDER=eupago
EUPAGO_API_KEY=your_test_api_key_here
# The backend is hardcoded to default to the Sandbox URL (https://sandbox.eupago.pt/api)
3. For Live / Production (When you go live)

env
PAYMENT_PROVIDER=eupago
EUPAGO_API_KEY=your_live_api_key_here
EUPAGO_BASE_URL=https://clientes.eupago.pt/api   <-- Simply override the base URL to point to the live server!

Notes
- Construpreço (the merchant) is never sent as a beneficiary. Only sellers are listed in
  `beneficiaries`; EuPago transfers the remaining amount to Construpreço automatically.
- Each supplier/factory must register with EuPago as a beneficiary (comercial@eupago.pt),
  state they are associated with Construpreço, and add the extern key EuPago gives them in
  their profile. Without it they cannot list products and buyers cannot purchase from them.
- Seller payout = merchandise × (1 − seller commission %). The commission % is set per seller
  in the admin panel (stored in `user.vatRate`), falling back to ADMIN_COMMISSION_PERCENT.
