1. For Mock Payments (Current State)

env
PAYMENT_PROVIDER=mock
# No API keys required, it will automatically fake the successful payment flow!
2. For Sandbox / Testing (When you get the testing keys)

env
PAYMENT_PROVIDER=eupago
EUPAGO_API_KEY=your_test_api_key_here
EUPAGO_ADMIN_EXTERN_KEY=your_admin_wallet_key
# The backend is hardcoded to default to the Sandbox URL (https://sandbox.eupago.pt/api)
3. For Live / Production (When you go live)

env
PAYMENT_PROVIDER=eupago
EUPAGO_API_KEY=your_live_api_key_here
EUPAGO_ADMIN_EXTERN_KEY=your_live_admin_wallet_key
EUPAGO_BASE_URL=https://clientes.eupago.pt/api   <-- Simply override the base URL to point to the live server!
