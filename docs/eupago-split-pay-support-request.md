# EuPago Split Pay — Support Request (Sandbox)

এই ফাইলে EuPago support-এ পাঠানোর **ইংরেজি message** এবং **কোথায় কী credentials/proof দিতে হবে** তার বাংলা গাইড আছে।

---

## বাংলায় — কোথায় কী দিতে হবে

নিচের ইংরেজি message-এ `[...]` ব্র্যাকেটে যেখানে যেখানে লেখা, সেখানে আপনার/ক্লায়েন্টের আসল তথ্য বসান।

| Message-এর জায়গা | কী লিখবেন | কোথা থেকে পাবেন |
|-------------------|-----------|----------------|
| `[CLIENT_SANDBOX_API_KEY]` | Sandbox **API Key** (পুরো key বা শেষ ৪ অক্ষর, যেমন `demo-****-****-68e`) | EuPago Backoffice → **Channels → Channel Listing** |
| `[client email or merchant ID]` | ক্লায়েন্টের sandbox **merchant email** বা EuPago দেওয়া **account/merchant ID** | ক্লায়েন্ট / EuPago welcome email |
| `[YOUR_PUBLIC_CALLBACK_URL]` | **পুরো** webhook URL (path সহ) — নিচের সেকশন দেখুন | Deployed API বা ngrok + `/api/checkout/webhook/eupago` |
| `[supplier sandbox email/merchant ID, if any]` | Supplier sandbox account-এর email বা ID (১–২টা) | ক্লায়েন্ট যদি আলাদা supplier sandbox দিয়ে থাকে |
| `[Paste exact API response JSON here...]` | Split API call fail করলে EuPago-র **পুরো JSON response** | Postman / curl / server log |
| `[Your full name]` | আপনার নাম | — |
| `[Your role]` | যেমন: Developer, Integration Engineer | — |
| `[Your company name, if any]` | আপনার কোম্পানি (freelance হলে optional) | — |
| `[Your email]` | যেখানে reply চান | — |
| `[Your phone, optional]` | ফোন (optional) | — |
| `[client company name]` | ক্লায়েন্ট কোম্পানির নাম | — |

### Webhook callback URL (`YOUR_PUBLIC_CALLBACK_URL`) — কোথা থেকে পাবেন?

EuPago এটা **দেয় না** — এটা **আপনার backend-এর public URL**, যেখানে payment paid হলে EuPago `POST` request পাঠাবে।

**Fixed path (এই project-এ):** `/api/checkout/webhook/eupago`

**পুরো URL ফর্ম্যাট:**

```
{API_BASE}/api/checkout/webhook/eupago
```

| পরিবেশ | উদাহরণ (support message + `.env`-এ একই URL) |
|--------|-----------------------------------------------|
| Deployed API | `https://api.luisfernandeslu.maktechgroup.tech/api/checkout/webhook/eupago` |
| Local + ngrok | `https://abc123.ngrok-free.app/api/checkout/webhook/eupago` |
| শুধু localhost | `http://localhost:8080/api/checkout/webhook/eupago` — EuPago internet থেকে **পৌঁছাতে পারবে না** |

**`.env`-এ:** `EUPAGO_CALLBACK_URL` = উপরের **পুরো URL** (শুধু domain নয়)।

**ngrok দিয়ে local test:**

1. Backend চালু করুন (`npm run dev`, port `8080`)
2. `ngrok http 8080` চালান
3. যে HTTPS URL পাবেন, শেষে path যোগ করুন: `https://<ngrok-id>.ngrok-free.app/api/checkout/webhook/eupago`
4. সেটাই `EUPAGO_CALLBACK_URL` এবং support message-এ `[YOUR_PUBLIC_CALLBACK_URL]`-এর জায়গায় বসান

**মনে রাখুন:** Message-এ URL দেওয়ার সময় আবার `/api/checkout/webhook/eupago` যোগ করবেন না — placeholder-এই **পুরো URL** বসান।

### Message পাঠানোর আগে চেকলিস্ট

- [ ] Sandbox API Key আছে কিনা (Channels → Channel Listing)
- [ ] একবার `POST https://sandbox.eupago.pt/api/v1/split-payments/multibanco` test করেছেন কিনা
- [ ] Error response JSON copy করে message-এ বসিয়েছেন কিনা (থাকলে)
- [ ] Webhook URL সঠিক কিনা (production/staging/ngrok)
- [ ] ক্লায়েন্টের merchant email/ID যোগ করেছেন কিনা

### Support-কে আর কী কী proof/credentials দিতে পারেন (ভালো practice)

| দিন | কেন দরকার |
|-----|-----------|
| Sandbox **API Key** (পুরো বা masked) | EuPago আপনার account খুঁজে পাবে |
| **Client merchant email / account ID** | কোন sandbox account-এর জন্য Split Pay |
| **Project name** (ConstruPreço) + সংক্ষিপ্ত বর্ণনা | Real marketplace integration proof |
| **API endpoint** যেটা integrate করছেন | Developer হিসেবে credible |
| **Error JSON** (যদি API reject করে) | Exact সমস্যা বোঝা যায় |
| **Webhook callback URL** | Integration serious |
| **Developer name, email, company** | Contact ও verification |
| এক লাইন: *"Client authorized us to request sandbox Split Pay keys"* | ক্লায়েন্টের পক্ষ থেকে developer হিসেবে কাজ করছেন |

### যা দেবেন না (security)

- Production API keys / passwords
- Client-এর personal banking details
- End-user (customer) card/bank data

### কোথায় পাঠাবেন

- **Email:** suporte@eupago.pt  
- **Ticket:** https://customer.support.eupago.com/servicedesk/customer/portal/5/create/70  

### Support থেকে কী চাইবেন (সংক্ষেপে)

1. Sandbox-এ **Split Pay enabled** কিনা confirm  
2. **Platform/marketplace `externKey`**  
3. **Supplier `externKey`** (১ বা ২টা sandbox account)  
4. Marketplace API key দিয়ে ওই externKey-গুলোতে split create করা যাবে কিনা  
5. Sandbox-এ Multibanco payment + webhook test করার steps  

---

## English message (copy & send to EuPago Support)

**Subject:** Sandbox Split Pay integration — request for `externKey` (marketplace + suppliers)

---

Hello EuPago Support Team,

I am a developer integrating EuPago **Split Payments** for a marketplace platform called **ConstruPreço** on behalf of our client.

Our client has provided sandbox credentials, and we can access the sandbox environment, but we are **unable to complete Split Pay testing** because we do not have the required **`externKey` values** for beneficiaries.

### What we are building

- A B2B/B2C construction materials marketplace
- At checkout, the customer pays once (Multibanco / MB WAY)
- The payment must be split between:
  1. **Platform (marketplace)** — commission, shipping, VAT
  2. **Supplier(s)** — product payout (minus platform commission)

### Our technical integration

- REST API: `POST https://sandbox.eupago.pt/api/v1/split-payments/multibanco`
- Authentication: `Authorization: ApiKey [CLIENT_SANDBOX_API_KEY]`
- Webhook callback: `[YOUR_PUBLIC_CALLBACK_URL]`
  - Example (deployed): `https://api.luisfernandeslu.maktechgroup.tech/api/checkout/webhook/eupago`
  - Example (local via ngrok): `https://your-subdomain.ngrok-free.app/api/checkout/webhook/eupago`
- Official documentation: https://eupago.readme.io/reference/split-payments

### Credentials we currently have

- Sandbox API Key: `[CLIENT_SANDBOX_API_KEY]`
- Sandbox base URL: `https://sandbox.eupago.pt/api`
- Client / merchant account email or ID (if known): `[client email or merchant ID]`

### What we do NOT have

- **`externKey` for the platform (admin/marketplace) beneficiary**
- **`externKey` for supplier beneficiary account(s)** (we may test with 1–2 supplier sandbox accounts)
- Confirmation that **Split Pay is enabled** on our sandbox account(s)

We understand that `externKey` is **not the same as the API Key** and is not visible in the backoffice under Channels → Channel Listing. We are requesting your help to obtain the correct keys for sandbox testing.

### What we need from you

Please confirm and provide:

1. Is **Split Pay enabled** on our sandbox marketplace account?
2. The **`externKey` for the platform/marketplace** account (for admin commission + fees)
3. The **`externKey` for supplier sandbox account(s)** — we plan to test with:
   - Supplier 1: `[supplier sandbox email/merchant ID, if any]`
   - Supplier 2 (optional): `[second supplier sandbox email/merchant ID, if any]`
4. Whether our **marketplace API key** is authorized to create split payments to those beneficiary `externKey` values
5. Any sandbox-specific test values or steps to simulate a successful Multibanco payment and webhook callback

### Error we see (if applicable)

When we attempt split payment without `externKey`, we get:

```json
[Paste exact API response JSON here, e.g. transactionStatus: Rejected, code, text]
```

Or our application blocks checkout because beneficiary keys are missing (`EupagoAdminNotConfigured` / `SellerPaymentNotConfigured`).

### About our request

We are the **integration developers** working for the client, not end users. We need sandbox `externKey` values only for **development and QA** before production go-live. We can provide additional proof if needed (company name, project URL, technical contact, client authorization, etc.).

Thank you for your help. We look forward to your guidance so we can finish sandbox testing.

Best regards,  
**[Your full name]**  
**[Your role]** — Developer / Integration Engineer  
**[Your company name, if any]**  
**[Your email]**  
**[Your phone, optional]**  
**Client / Project:** ConstruPreço Marketplace — `[client company name]`  
**Preferred language:** English

---

## Optional: quick sandbox test (before emailing)

Replace placeholders and run in terminal to capture an error/success for the message above:

```bash
curl -X POST "https://sandbox.eupago.pt/api/v1/split-payments/multibanco" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey YOUR_SANDBOX_API_KEY" \
  -d '{
    "amount": 10.00,
    "identifier": "construpreco-split-test",
    "lang": "PT",
    "beneficiaries": [
      {
        "externKey": "YOUR_EXTERN_KEY_OR_PLACEHOLDER",
        "amount": 10.00,
        "identifier": "test-beneficiary-1",
        "immediatePayment": false
      }
    ]
  }'
```

- `"transactionStatus": "Success"` → API key works; externKey likely valid  
- `"transactionStatus": "Rejected"` → paste that JSON into the support message

---

## After EuPago replies — project config

| Key | Where to put it |
|-----|-----------------|
| Webhook callback (full URL) | `backend/.env` → `EUPAGO_CALLBACK_URL` (e.g. `https://api.example.com/api/checkout/webhook/eupago`) |
| Platform `externKey` | `backend/.env` → `EUPAGO_ADMIN_EXTERN_KEY` |
| Supplier `externKey` | DB → `BusinessProfile.eupagoExternKey` per supplier |
| Enable real split | `PAYMENT_PROVIDER=eupago` in `backend/.env` |

See also: `backend/.env.example` and `backend/src/modules/payments/eupago.client.js`.
