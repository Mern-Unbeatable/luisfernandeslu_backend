# Transporter API Integration Guide

Base URL: `{{baseUrl}}` (local: `http://localhost:8080`)

All authenticated transporter routes need:

```http
Authorization: Bearer {{accessToken}}
```

Role must be `transporter`. Wrong role → `403`. Missing/invalid token → `401`.

---

## Common response envelope

**Success (JSON):**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "...",
  "...data": {}
}
```

**Error:**

```json
{
  "success": false,
  "statusCode": 400,
  "error": "ValidationError",
  "message": "..."
}
```

**Pagination (when present):**

```json
{
  "page": 1,
  "limit": 20,
  "total": 10,
  "totalPages": 1
}
```

PDF endpoints return binary (`Content-Type: application/pdf`), not JSON.

---

## 1. Auth

### `POST /api/auth/register/transporter`

Register a new transporter (multipart).

| | |
|---|---|
| Auth | None |
| Content-Type | `multipart/form-data` |

**Body (form fields):**

| Field | Required | Notes |
|---|---|---|
| `fullName` | yes | min 2 |
| `email` | yes | |
| `phone` | yes | min 6 |
| `iban` | yes | min 5 |
| `password` | yes | min 8 |
| `confirmPassword` | no | must match password if sent |

**Files (optional):** `ibanProof`, `civilLiability` / `transporterCivilLiability`, `idDocuments` / `idDocument`, `addressProof`, …

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registration successful",
  "accessToken": "...",
  "tokenType": "Bearer",
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "transporter",
    "status": "PENDING_VERIFICATION",
    "phoneNumber": "...",
    "emailVerified": false
  },
  "profile": { },
  "requiresEmailVerification": false,
  "otpExpiresAt": null
}
```

---

### `POST /api/auth/login/transporter`

| | |
|---|---|
| Auth | None |
| Content-Type | `application/json` |

**Body:**

```json
{
  "email": "transporter@test.local",
  "password": "Password123!"
}
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "accessToken": "...",
  "tokenType": "Bearer",
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "transporter",
    "status": "...",
    "phoneNumber": "...",
    "image": null,
    "emailVerified": true
  },
  "profile": { }
}
```

---

### Shared auth (transporter can use)

| Method | Route | Body |
|---|---|---|
| `POST` | `/api/auth/forgot-password` | `{ "email" }` |
| `POST` | `/api/auth/verify-reset-otp` | `{ "email", "otp" }` (5 digits) |
| `POST` | `/api/auth/reset-password` | `{ "password", "confirmPassword" }` + `resetToken` **or** `email`+`otp` |
| `POST` | `/api/auth/logout` | — (client discards token) |
| `GET` | `/api/auth/me` | Bearer required → `{ user, profile }` |

---

## 2. Profile

Base: `/api/transporter/profile`  
Auth: Bearer + role `transporter`

### `GET /api/transporter/profile`

No query filters.

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile fetched",
  "profile": {
    "displayName": "...",
    "displayEmail": "...",
    "name": "...",
    "email": "...",
    "phone": "...",
    "avatarUrl": null,
    "iban": "...",
    "ibanPhone": "..."
  }
}
```

---

### `PATCH /api/transporter/profile`

Update name and/or phone.

**Body (JSON) — at least one field:**

```json
{
  "name": "John Smith",
  "phone": "+351910000000"
}
```

Aliases: `fullName` → name, `phoneNumber` → phone.  
`email` in body is ignored by service.

**Response `200`:** same `profile` shape, `message: "Profile updated"`.

---

### `POST /api/transporter/profile/password`

**Body:**

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

Also accepts `password` instead of `newPassword`.

**Response `200`:** `{ "message": "Password changed successfully" }` (sessions cleared).

---

### `PUT /api/transporter/profile/iban`

**Body:**

```json
{
  "iban": "PT50000201231234567890154",
  "ibanPhone": "+351910000000"
}
```

Aliases: `ibanNumber`, `phone` / `phoneNumber` for phone.

**Response `200`:** `profile` + `message: "IBAN saved"`.

---

### `POST /api/transporter/profile/avatar`

| | |
|---|---|
| Content-Type | `multipart/form-data` |

**Form:** file field `avatar` or `image` (JPEG/PNG/WEBP).

**Response `200`:** `profile` + `message: "Avatar updated"`.

---

### `DELETE /api/transporter/profile/avatar`

No body.

**Response `200`:** `profile` + `message: "Avatar removed"`.

---

## 3. Shipment auctions

Base: `/api/transporter/auctions`  
Auth: Bearer + `transporter`

### `GET /api/transporter/auctions`

**Query filters:**

| Param | Type | Default | Allowed |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `20` | |
| `filter` | string | `all` | `all`, `ending_soon` / `endingSoon`, `nearest` / `nearestFirst`, `ended` / `ENDED` |

**Example:**

```http
GET /api/transporter/auctions?page=1&limit=20&filter=ending_soon
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Auctions fetched",
  "filter": "ending_soon",
  "auctions": [
    {
      "id": "uuid",
      "auctionId": "uuid",
      "productName": "...",
      "auctionStatus": "PENDING_BIDS",
      "isEnded": false,
      "canBid": true,
      "expiresAt": "...",
      "createdAt": "...",
      "quantity": 10,
      "pickupLocation": "...",
      "deliveryLocation": "...",
      "distanceKm": 21.5,
      "bidStartFrom": 180,
      "isFactoryOrder": false,
      "bids": [
        {
          "bidId": "uuid",
          "transporterName": "...",
          "bidAmount": 150,
          "createdAt": "...",
          "isMine": true,
          "isWinner": false
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

---

### `GET /api/transporter/auctions/:id`

| Param | Notes |
|---|---|
| `id` | Auction UUID |

Details are available mainly after assignment (otherwise may `403`).

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Auction details fetched",
  "auction": {
    "auctionId": "uuid",
    "auctionStatus": "ASSIGNED",
    "order": {
      "id": "...",
      "dbId": "...",
      "orderNumber": "ORD-...",
      "status": "...",
      "auctionDate": "..."
    },
    "customer": {
      "id": "...",
      "name": "...",
      "email": "...",
      "phone": "...",
      "deliveryAddress": "..."
    },
    "shipping": {
      "pickupLocation": "...",
      "deliveryLocation": "...",
      "unloadingInstructions": "...",
      "accessCondition": "...",
      "additionalNotes": "..."
    },
    "product": {
      "name": "...",
      "sku": "...",
      "weightKg": 50,
      "price": 8.5
    },
    "bidSummary": {
      "shippingCharge": 180,
      "lowestBid": 150,
      "totalBids": 2
    },
    "bids": [],
    "assignedTransporter": {
      "id": "...",
      "name": "...",
      "email": "...",
      "phone": "...",
      "bidAmount": 150,
      "assignedAt": "..."
    }
  }
}
```

---

### `POST /api/transporter/auctions/:id/bids`

Submit a bid (must be **strictly lower** than start / max allowed).

**Body:**

```json
{
  "bidAmount": 150
}
```

| Field | Required | Notes |
|---|---|---|
| `bidAmount` | yes | number > 0 |

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Bid submitted",
  "id": "bid-uuid",
  "bidAmount": 150,
  "createdAt": "..."
}
```

**Errors:** `404` auction not active; `400` expired / bid too high.

---

## 4. Assigned deliveries

Base: `/api/transporter/deliveries`  
Auth: Bearer + `transporter`  

**Important:** `:id` on delivery routes = **auction UUID** (not order id).

### `GET /api/transporter/deliveries`

**Query filters:**

| Param | Type | Default | Allowed |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `20` | |
| `status` | string | active set | omit / `all` → `ASSIGNED` + `PICKED_UP` + `IN_TRANSIT`; also `assigned`, `picked_up` / `pickup`, `in_transit`, `delivered` / `completed` |

**Example:**

```http
GET /api/transporter/deliveries?page=1&limit=20&status=assigned
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Assigned deliveries fetched",
  "deliveries": [
    {
      "auctionId": "uuid",
      "orderId": "ORD-...",
      "productName": "...",
      "status": "Assigned",
      "orderStatus": "ASSIGNED",
      "bidAmount": 150,
      "distanceKm": 21,
      "pickupLocation": "...",
      "deliveryLocation": "...",
      "pickedAt": null,
      "actions": {
        "canStartTrip": true,
        "canMarkPickedUp": false,
        "canNavigateToDelivery": false,
        "canVerifyDelivery": false,
        "canSeeDetails": true,
        "otpSent": false
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

---

### `GET /api/transporter/deliveries/completed`

**Query:** `page`, `limit` only (always delivered/completed).

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Completed deliveries fetched",
  "deliveries": [
    {
      "auctionId": "uuid",
      "productName": "...",
      "orderId": "ORD-...",
      "bidAmount": 150,
      "distanceKm": 21,
      "status": "delivered",
      "pickup": { "name": "...", "address": "..." },
      "delivery": { "name": "...", "address": "..." },
      "pickedAt": "..."
    }
  ],
  "pagination": { }
}
```

---

### `GET /api/transporter/deliveries/:id`

**Response `200`:** `delivery` object with `auctionId`, `orderId`, `status`, `orderStatus`, `bidAmount`, `distanceKm`, `quantity`, `customer`, `shipping`, `product`, `steps[]`, `actions`, `assignedTransporter`, …

---

### `PATCH /api/transporter/deliveries/:id/status`

Advance delivery workflow.

**Body:**

```json
{
  "action": "START_TRIP"
}
```

| `action` value | Meaning |
|---|---|
| `START_TRIP` | Start trip |
| `MARK_PICKED_UP` | Mark picked up |
| `NAVIGATE_TO_DELIVERY` | Navigate / in transit |
| `VERIFY_DELIVERY` | Send OTP to customer |

Snake_case aliases also accepted (e.g. `start_trip`).

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "id": "auction-uuid",
  "message": "Trip started"
}
```

Other messages: `"Marked picked up"`, `"Navigating to delivery"`, `"Delivery OTP sent to customer"`.

---

### `POST /api/transporter/deliveries/:id/verify-otp`

Confirm delivery with customer OTP (+ optional proof images).

| | |
|---|---|
| Content-Type | `multipart/form-data` or JSON |

**Body / form:**

| Field | Required | Notes |
|---|---|---|
| `otp` | yes | 4 digits |
| `proof` | no | URL list (JSON) and/or files `proof` / `proof[]` (JPEG/PNG/WEBP) |

**Example (JSON):**

```json
{
  "otp": "1234"
}
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Delivery verified",
  "id": "auction-uuid",
  "proof": ["http://.../uploads/..."]
}
```

---

## 5. Insurance

Base: `/api/transporter/insurance`  
Auth: Bearer + `transporter`

### `GET /api/transporter/insurance`

No filters.

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Insurance fetched",
  "requirementsMet": true,
  "policies": [
    {
      "type": "civil",
      "status": "verified",
      "provider": "...",
      "policyNumber": "...",
      "coverageAmount": 100000,
      "startDate": "...",
      "expiryDate": "...",
      "documentUrl": "http://..."
    },
    {
      "type": "cargo",
      "status": "verified",
      "provider": "...",
      "policyNumber": "...",
      "coverageAmount": 50000,
      "startDate": "...",
      "expiryDate": "...",
      "documentUrl": "http://..."
    }
  ]
}
```

`type`: `civil` | `cargo`  
`status`: `pending` | `verified` | `expired` | `rejected`

---

### `POST /api/transporter/insurance`

Upload or renew a policy.

| | |
|---|---|
| Content-Type | `multipart/form-data` |

**Form fields:**

| Field | Required | Notes |
|---|---|---|
| `type` or `insuranceType` | yes | `civil` \| `cargo` |
| `provider` | yes | |
| `policyNumber` | yes | |
| `coverageAmount` | yes | number > 0 |
| `expiryDate` | yes | |
| `startDate` | no | |
| `document` / `document[]` | yes on first create | JPEG/PNG/WEBP/PDF/DOC/DOCX |

**Response `201` / `200`:** policy fields with `"status": "pending"` + message that admin verification is required.

> Upload / renew **always** sets insurance `status` to `pending`. `requirementsMet` stays `false` until admin verifies both civil + cargo. Profile `verificationStatus` moves to `PENDING_REVIEW`.

Admin verify/reject:

- `POST /api/admin/transporters/:id/insurance/:kind/verify` (`kind` = `civil` | `cargo`)
- `POST /api/admin/transporters/:id/insurance/:kind/reject` body optional `{ "reason": "..." }`

---

### `GET /api/transporter/insurance/:kind/pdf`

| Param | Values |
|---|---|
| `kind` | `civil` \| `cargo` |

**Response:** PDF binary download.

---

## 6. Payments & payouts

Base: `/api/transporter/payments-payouts`  
Auth: Bearer + `transporter`

### `GET /api/transporter/payments-payouts`

**Query filters:**

| Param | Type | Default | Allowed |
|---|---|---|---|
| `period` | string/int | `thisYear` | `thisYear`, `lastYear`, or year `2000–2100` |
| `page` | int | `1` | |
| `limit` | int | `7` | max `50` |

**Example:**

```http
GET /api/transporter/payments-payouts?period=thisYear&page=1&limit=7
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payments fetched",
  "stats": {
    "totalEarnings": 0,
    "adminCommissionPercent": 0,
    "availableBalance": 0,
    "pendingEarnings": 0,
    "monthlyAverage": 0
  },
  "revenue": {
    "year": 2026,
    "maxValue": 0,
    "yTicks": [],
    "points": []
  },
  "paymentHistory": [
    {
      "date": "...",
      "type": "withdrawal",
      "accountType": "bank_transfer",
      "accountNumber": "...",
      "amount": 100,
      "status": "pending"
    }
  ],
  "pagination": { }
}
```

`paymentHistory.status`: `pending` | `approved` | `rejected`

---

### `POST /api/transporter/payments-payouts/withdrawals`

Request a payout.

**Body:**

```json
{
  "amount": 100,
  "businessName": "My Transport Lda",
  "routingNumber": "001",
  "accountNumber": "PT50000201231234567890154"
}
```

| Field | Required |
|---|---|
| `amount` | yes (> 0) |
| `businessName` | yes (min 2) |
| `routingNumber` | yes (min 3) |
| `accountNumber` | yes (min 5) |

**Response `201`:** history-style row + `message: "Withdrawal request submitted"`.

**Errors:** `400` insufficient balance / validation.

---

## 7. Commission invoices

Base: `/api/transporter/commission-invoices`  
Auth: Bearer + `transporter`  

(Orders where this transporter has an **ACCEPTED** bid.)

### `GET /api/transporter/commission-invoices`

**Query filters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | optional search |
| `page` | int | `1` | |
| `limit` | int | `7` | max `50` |

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "invoices": [
    {
      "id": "CI-01063",
      "type": "Invoice",
      "orderId": "ORD-...",
      "customer": "...",
      "amount": "€285.00",
      "date": "2024-05-28"
    }
  ],
  "pagination": { }
}
```

---

### `GET /api/transporter/commission-invoices/:invoiceId`

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "id": "CI-...",
  "type": "Invoice",
  "orderId": "ORD-...",
  "customer": "...",
  "amount": "...",
  "date": "...",
  "orderTotal": 0,
  "commissionPercent": 0,
  "partyPayout": 0
}
```

---

### `GET /api/transporter/commission-invoices/:invoiceId/pdf`

**Response:** PDF binary download.

---

## Quick route index

| Area | Method | Route |
|---|---|---|
| Auth | `POST` | `/api/auth/register/transporter` |
| Auth | `POST` | `/api/auth/login/transporter` |
| Profile | `GET` | `/api/transporter/profile` |
| Profile | `PATCH` | `/api/transporter/profile` |
| Profile | `POST` | `/api/transporter/profile/password` |
| Profile | `PUT` | `/api/transporter/profile/iban` |
| Profile | `POST` | `/api/transporter/profile/avatar` |
| Profile | `DELETE` | `/api/transporter/profile/avatar` |
| Auctions | `GET` | `/api/transporter/auctions` |
| Auctions | `GET` | `/api/transporter/auctions/:id` |
| Auctions | `POST` | `/api/transporter/auctions/:id/bids` |
| Deliveries | `GET` | `/api/transporter/deliveries` |
| Deliveries | `GET` | `/api/transporter/deliveries/completed` |
| Deliveries | `GET` | `/api/transporter/deliveries/:id` |
| Deliveries | `PATCH` | `/api/transporter/deliveries/:id/status` |
| Deliveries | `POST` | `/api/transporter/deliveries/:id/verify-otp` |
| Insurance | `GET` | `/api/transporter/insurance` |
| Insurance | `POST` | `/api/transporter/insurance` |
| Insurance | `GET` | `/api/transporter/insurance/:kind/pdf` |
| Payments | `GET` | `/api/transporter/payments-payouts` |
| Payments | `POST` | `/api/transporter/payments-payouts/withdrawals` |
| Invoices | `GET` | `/api/transporter/commission-invoices` |
| Invoices | `GET` | `/api/transporter/commission-invoices/:invoiceId` |
| Invoices | `GET` | `/api/transporter/commission-invoices/:invoiceId/pdf` |

---

## Postman

Collection: `backend/postman/CONSTRUPRECO_API.postman_collection.json`

Folders:

- **Auth → Login → Transporter**
- **Auth → Register → Transporter**
- **Dashboard → Transporter** → Shipment Auctions, Assigned Deliveries, Profile, Insurance, Payments & Payouts, Commission Invoices

Demo login (after seed): `transporter@test.local` / `Password123!`
