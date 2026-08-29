# Factory API Integration Guide

Base URL: `{{baseUrl}}` (local: `http://localhost:8080`)

All authenticated factory routes need:

```http
Authorization: Bearer {{accessToken}}
```

Role must be `factory` (unless noted). Wrong role → `403`. Missing/invalid token → `401`.

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

PDF / CSV template endpoints return binary, not JSON.

---

## 1. Auth

### `POST /api/auth/register/factory`

Register a new factory (multipart).

| | |
|---|---|
| Auth | None |
| Content-Type | `multipart/form-data` |

**Body (form fields):**

| Field | Required | Notes |
|---|---|---|
| `factoryName` | yes | min 2 |
| `email` | yes | |
| `phone` | yes | min 6 |
| `iban` | yes | min 5 |
| `password` | yes | min 8 |
| `confirmPassword` | no | must match password if sent |

**Files (optional):** `factoryCertificate`, `rcbe`, `ibanProof`, `idDocuments` / `idDocument`, `addressProof`, …

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
    "role": "factory",
    "status": "PENDING_VERIFICATION",
    "phoneNumber": "...",
    "emailVerified": true
  },
  "profile": { },
  "requiresEmailVerification": false,
  "otpExpiresAt": null
}
```

> Factory registration does **not** require email OTP. Account starts as `PENDING_VERIFICATION` (admin review).

---

### `POST /api/auth/login/factory`

| | |
|---|---|
| Auth | None |
| Content-Type | `application/json` |

**Body:**

```json
{
  "email": "factory@test.local",
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
    "role": "factory",
    "status": "...",
    "phoneNumber": "...",
    "image": null,
    "emailVerified": true
  },
  "profile": { }
}
```

---

### Shared auth (factory can use)

| Method | Route | Body |
|---|---|---|
| `POST` | `/api/auth/forgot-password` | `{ "email" }` |
| `POST` | `/api/auth/verify-reset-otp` | `{ "email", "otp" }` (5 digits) |
| `POST` | `/api/auth/reset-password` | `{ "password", "confirmPassword" }` + `resetToken` **or** `email`+`otp` |
| `POST` | `/api/auth/logout` | — (client discards token) |
| `GET` | `/api/auth/me` | Bearer required → `{ user, profile }` |

---

## 2. Dashboard overview

Base: `/api/factory/dashboard`  
Auth: Bearer + role `factory`

### `GET /api/factory/dashboard`

No query filters. Returns all card + chart data for the Factory Dashboard Overview UI in one call (revenue = **current year only**).

Scoped to `FACTORY_CONVERSION` orders where this factory is the seller (cancelled excluded).

**Status buckets (donut):**

| Key | Order statuses |
|---|---|
| `completed` | `COMPLETED`, `DELIVERED` |
| `inProduction` | `IN_PRODUCTION`, `PRODUCED`, `READY` |
| `pending` | `NEW`, `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT` |

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Factory dashboard fetched",
  "stats": {
    "totalOrders": 1284,
    "pendingOrders": 48,
    "completedOrders": 1236,
    "totalRevenue": 40000000,
    "adminCommissionPercent": 20,
    "adminCommissionLabel": "20% per order"
  },
  "revenue": {
    "year": 2026,
    "months": [{ "month": "Jan", "value": 0 }, { "month": "Aug", "value": 4701.8 }],
    "values": [0, 0, 0, 0, 0, 0, 0, 4701.8, 0, 0, 0, 0],
    "maxValue": 5000,
    "yTicks": [0, 1250, 2500, 3750, 5000]
  },
  "orderStatus": {
    "thisMonth": [
      { "key": "completed", "value": 1236, "color": "#DF900A" },
      { "key": "inProduction", "value": 32, "color": "#E85A8C" },
      { "key": "pending", "value": 16, "color": "#84CC16" }
    ],
    "thisWeek": [
      { "key": "completed", "value": 0, "color": "#DF900A" },
      { "key": "inProduction", "value": 0, "color": "#E85A8C" },
      { "key": "pending", "value": 0, "color": "#84CC16" }
    ]
  }
}
```

`revenue.values` = Jan→Dec (12 numbers) for the **current year** line chart.  
`orderStatus.thisMonth` / `thisWeek` = donut slices (filter on FE).

---

## 3. Profile

Base: `/api/factory/profile`  
Auth: Bearer + role `factory`

### `GET /api/factory/profile`

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
    "warehouses": [
      {
        "id": "...",
        "label": "Warehouse 1",
        "address": "..."
      }
    ],
    "iban": "...",
    "ibanPhone": "..."
  }
}
```

---

### `PATCH /api/factory/profile`

Update name, email, and/or phone.

**Body (JSON) — at least one field:**

```json
{
  "name": "Cimento do Tejo",
  "email": "factory@test.local",
  "phone": "+351910000000"
}
```

Alias: `phoneNumber` → phone.

**Response `200`:** same `profile` shape, `message: "Profile updated"`.

---

### `PUT /api/factory/profile/warehouses`

Replace warehouse list (min 1). First entry becomes the default.

**Body:**

```json
{
  "warehouses": [
    {
      "id": "optional-existing-address-id",
      "label": "Main plant",
      "address": "Rua Example 1, Amadora"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `warehouses` | yes | array, min 1 |
| `warehouses[].address` | yes | |
| `warehouses[].id` | no | existing address id to update |
| `warehouses[].label` | no | |

**Response `200`:** `profile` + `message: "Warehouses saved"`.

---

### `POST /api/factory/profile/password`

**Body:**

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

Also accepts `password` instead of `newPassword`. Confirm aliases: `confirmNewPassword`.

**Response `200`:** `{ "message": "Password changed successfully" }` (sessions cleared).

---

### `PUT /api/factory/profile/iban`

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

## 4. Products

Base: `/api/factory/products`  
Auth: Bearer + `factory`

**UI status mapping:**

| `approvalStatus` | UI `status` / `cardStatus` |
|---|---|
| `PENDING_REVIEW` | `pending` |
| `REJECTED` | `rejected` |
| `DRAFT` | `draft` |
| `APPROVED` | `active` |

New products are always submitted as `PENDING_REVIEW` (admin verification). No inventory / stock quantity on factory products.

### `GET /api/factory/products`

**Query filters:**

| Param | Type | Default | Allowed |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–50 | `12` | |
| `tab` | string | `all` | `all`, `active`, `pending`, `rejected` |
| `categoryId` | uuid | — | optional |
| `category` | string | — | optional |
| `search` | string | — | optional |

**Example:**

```http
GET /api/factory/products?page=1&limit=12&tab=pending
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Factory products fetched",
  "products": [
    {
      "id": "uuid",
      "sku": "...",
      "title": "...",
      "warehouseLocation": "...",
      "factoryName": "...",
      "basePrice": 8.5,
      "weightKg": 25,
      "unitOfMeasure": "bag",
      "priceLabel": "...",
      "description": "...",
      "bannerImage": null,
      "category": {},
      "subCategory": {},
      "productType": {},
      "approvalStatus": "PENDING_REVIEW",
      "rejectionReason": null,
      "status": "pending",
      "cardStatus": "pending",
      "hasInventory": false,
      "averageRating": 0,
      "reviewCount": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1
  },
  "counts": {
    "all": 1,
    "active": 0,
    "pending": 1,
    "rejected": 0
  },
  "filters": {
    "tab": "pending",
    "categoryId": null,
    "category": null,
    "search": null
  }
}
```

---

### `POST /api/factory/products/ai-generate`

Generate product copy with AI.

**Body:**

```json
{
  "title": "Portland Cement Quick Set",
  "field": "description"
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `field` | yes | `description` \| `feature` \| `additionalInfo` \| `specifications` |

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "field": "description",
  "content": "...",
  "provider": "...",
  "message": "AI content generated"
}
```

---

### `POST /api/factory/products`

Create a product (multipart).

| | |
|---|---|
| Content-Type | `multipart/form-data` |

**Form fields:**

| Field | Required | Notes |
|---|---|---|
| `sku` | yes | |
| `title` | yes | |
| `warehouseLocation` | yes | |
| `categoryId` | yes | uuid |
| `subCategoryId` | yes | uuid |
| `productTypeId` | yes | uuid |
| `basePrice` | yes | number > 0 |
| `weightKg` | no | default `0` |
| `description` | no | |
| `feature` | no | |
| `additionalInfo` | no | |
| `specifications` | no | |

**Files:** `bannerImage` (1), `images` (up to 20).

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "id": "uuid",
  "sku": "...",
  "title": "...",
  "approvalStatus": "PENDING_REVIEW",
  "rejectionReason": null,
  "message": "Product created and submitted for admin verification"
}
```

---

### `GET /api/factory/products/csv-template`

**Response:** CSV file download.  
Headers: `sku,title,warehouseLocation,category,subCategory,productType,basePrice,weightKg,description,feature,additionalInfo,specifications,bannerImageUrl,imageUrls`

---

### `GET /api/factory/products/csv-category-guide`

**Response:** PDF binary (`category-subcategory-type-guide.pdf`).

---

### `POST /api/factory/products/csv-upload`

Bulk import (max 100 rows).

| | |
|---|---|
| Content-Type | `multipart/form-data` |

**Form:** file field `file` (CSV).

Required columns: `sku`, `title`, `warehouseLocation`, `category`, `subCategory`, `productType`, `basePrice`.

**Response `200`:** `summary: { total, created, failed }`, `created[]`, `failed[]`, `expectedHeaders`.

---

### `GET /api/factory/products/:id`

Full product (includes `additionalInfo`, `specifications`, `features`, `gallery`).

---

### `PATCH /api/factory/products/:id`

Update product (multipart optional). Editable: `title`, `warehouseLocation`, `basePrice`, `weightKg`, text fields, images.  
Category path is locked. SKU is not editable.

---

### `POST /api/factory/products/:id/resubmit`

Rejected products only → back to `PENDING_REVIEW`. Same edit body/files as PATCH.

---

### `POST /api/factory/products/:id/cancel`

Pending products only → `DRAFT`.

---

### `DELETE /api/factory/products/:id`

**Response `200`:** `{ "message": "Product deleted" }`.

---

## 5. Orders (from supplier)

Base: `/api/factory/orders`  
Auth: Bearer + `factory`  

Orders with `orderSource = FACTORY_CONVERSION` where this factory is the seller.

**Pipeline statuses:** `NEW` → `IN_PRODUCTION` → `PRODUCED` → `READY` → (auction / transport) → `ASSIGNED` → `PICKED_UP` → `IN_TRANSIT` → `COMPLETED` / `DELIVERED` / `CANCELLED`

**Factory can set via PATCH:**

| Next status | From |
|---|---|
| `IN_PRODUCTION` | `NEW` |
| `PRODUCED` | `IN_PRODUCTION` |
| `READY` | `PRODUCED` |

---

### `GET /api/factory/orders/companies`

Buyer (supplier) filter options for the factory’s orders.

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Company filter options fetched",
  "companies": [
    {
      "id": "...",
      "name": "...",
      "email": "..."
    }
  ]
}
```

---

### `GET /api/factory/orders`

**Query filters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `10` | |
| `status` | string | `all` | pipeline status or `all` |
| `search` | string | — | optional |
| `companyId` | string | — | buyer (supplier) filter |

**Example:**

```http
GET /api/factory/orders?page=1&limit=10&status=NEW
```

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Supplier factory orders fetched",
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-...",
      "orderStatus": "NEW",
      "status": "New",
      "orderSource": "FACTORY_CONVERSION",
      "factoryId": "...",
      "factoryName": "...",
      "companyId": "...",
      "companyName": "...",
      "supplier": { "id": "...", "name": "..." },
      "factory": { "id": "...", "name": "..." },
      "product": "...",
      "qty": 10,
      "quantityUnit": "bags",
      "weightSize": null,
      "shippingCharge": 0,
      "total": 1000,
      "installmentAmount": null,
      "installmentNumber": null,
      "currency": "EUR",
      "date": "...",
      "actions": {
        "canViewDetails": true,
        "canDelete": false,
        "canMarkInProduction": true,
        "canMarkProduced": false,
        "canMarkReady": false,
        "nextStatus": "IN_PRODUCTION"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### `GET /api/factory/orders/:id`

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Factory order details fetched",
  "order": {
    "id": "uuid",
    "orderNumber": "ORD-...",
    "orderDate": "...",
    "orderStatus": "NEW",
    "status": "New",
    "supplier": {
      "name": "...",
      "email": null,
      "phone": null,
      "address": "...",
      "region": null,
      "zipCode": null,
      "country": null
    },
    "payment": {
      "totalOrderAmount": 1000,
      "paymentStatus": "PENDING",
      "remainingAmount": 0,
      "currency": "EUR"
    },
    "products": [
      {
        "product": "...",
        "quantity": 10,
        "shipping": "Included",
        "uom": null,
        "unitPrice": 100,
        "amount": 1000,
        "vat": 0,
        "net": 1000,
        "total": 1000
      }
    ],
    "installmentBreakdown": [],
    "installments": [
      {
        "id": "...",
        "title": "...",
        "status": "Paid",
        "date": "...",
        "amount": 400,
        "quantity": 40,
        "actions": {
          "canView": true,
          "canPay": false,
          "canCancel": false
        }
      }
    ]
  }
}
```

---

### `PATCH /api/factory/orders/:id/status`

Advance production workflow.

**Body:**

```json
{
  "status": "IN_PRODUCTION"
}
```

| `status` value | Meaning |
|---|---|
| `IN_PRODUCTION` | Start production |
| `PRODUCED` | Mark produced |
| `READY` | Ready for shipment auction |

Aliases accepted (e.g. `in_production`, `produced`, `ready`).

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Order moved to In Production",
  "order": {
    "id": "...",
    "orderNumber": "ORD-...",
    "orderStatus": "IN_PRODUCTION",
    "updatedAt": "...",
    "status": "In Production",
    "actions": {}
  }
}
```

Other messages: `"Order marked as Produced"`, `"Order marked as Ready"`.

---

## 6. Shipment auctions

Base: `/api/factory/auctions`  
Auth: Bearer + `factory`  

Only auctions for this factory’s `FACTORY_CONVERSION` orders (`isFactoryOrder: true`).

**Vehicle types:** `HEAVY_TRUCK` | `FLATBED` | `TIPPER` | `CRANE_TRUCK` | `VAN`

> Confirm / decline auction payment after assignment are **supplier** actions (not on factory routes).

### `GET /api/factory/auctions/order/:orderId`

Prefill data before creating an auction.  
`:orderId` = order UUID **or** order number.

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Factory auction create info fetched",
  "order": {
    "id": "ORD-...",
    "dbId": "uuid",
    "orderNumber": "ORD-...",
    "pickupLocation": "...",
    "deliveryLocation": "...",
    "distanceKm": null,
    "bidStartFrom": null,
    "pricePerKm": 0,
    "customer": {
      "id": null,
      "name": "...",
      "email": null,
      "phone": null
    },
    "product": {}
  }
}
```

---

### `POST /api/factory/auctions`

Create a shipment auction for a ready factory order.

**Body:**

```json
{
  "orderId": "ORD-...",
  "requiredVehicleType": "HEAVY_TRUCK"
}
```

| Field | Required | Notes |
|---|---|---|
| `orderId` | yes | UUID or order number |
| `requiredVehicleType` | yes | see vehicle types above |

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "id": "auction-uuid",
  "auctionId": "AUC-...",
  "message": "Factory shipment auction created",
  "distanceKm": 21.5,
  "bidStartPrice": 180,
  "pricePerKm": 0
}
```

---

### `GET /api/factory/auctions/active`

Open auctions awaiting bids (`PENDING_BIDS`).

**Query:** `page` (default `1`), `limit` (default `20`, max `100`).

**Response `200`:** `auctions[]` cards + `pagination`.

Card fields include: `auctionId`, `orderId`, `orderDbId`, `orderNumber`, `auctionStatus`, `orderStatus`, `requiredVehicleType`, `isFactoryOrder`, `shippingCharge`, `maxAllowedBid`, `expiresAt`, `createdAt`, `customerName`, `pickupLocation`, `deliveryLocation`, `productName`, `totalBids`, `assignedTransporter`, `bidPrice`.

---

### `GET /api/factory/auctions/assigned`

Assigned / pending-payment auctions (`ASSIGNED`, `PENDING_PAYMENT`).

**Query:** same as active (`page`, `limit`).

---

### `GET /api/factory/auctions/active/:id`

### `GET /api/factory/auctions/assigned/:id`

**Response `200`:** auction detail with `auctionId`, `auctionStatus`, `order`, `customer`, `shipping`, `product`, `bidSummary`, `bids[]`, `assignedTransporter`.

---

## 7. Offers (to supplier)

Base: `/api/factory-offers`  
Auth: Bearer + `factory` **or** `supplier` (see per-route notes)

Used for factory → supplier offer cards inside `FACTORY_SUPPLIER` chat threads.

### `POST /api/factory-offers`

**Factory only.** Send an offer card to a supplier.

**Body:**

```json
{
  "supplierId": "cuid",
  "productId": "uuid",
  "warehouseLocation": "Amadora plant",
  "productName": "Portland Cement",
  "totalQuantity": 100,
  "quantityUnit": "bags",
  "projectName": "Site Alpha",
  "deliveryLocation": "Lisbon",
  "unloadingType": "...",
  "accessConditions": "...",
  "totalPrice": 1000,
  "installmentMonths": 3,
  "installments": [
    { "price": 400, "quantity": 40 },
    { "price": 300, "quantity": 30 },
    { "price": 300, "quantity": 30 }
  ]
}
```

Aliases: `warehouse` → `warehouseLocation`, `product` → `productName`.  
`productId` is required by the service.

**Response `201`:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Offer card sent to supplier",
  "offer": {},
  "chatMessage": {},
  "threadId": "..."
}
```

Offer card highlights: `id`, `title` (`"Offer Card"`), `status`, `statusLabel`, `warehouseLocation`, `product`, `productId`, `quantity` / `totalQuantity`, `quantityUnit`, `projectName`, `deliveryLocation`, `unloadingType`, `accessConditions`, `totalPrice`, `installmentMonths`, `installments[]`, `pricing[]`, `summary`, timestamps.

---

### `GET /api/factory-offers/threads/:threadId/messages`

Factory or supplier participant of a `FACTORY_SUPPLIER` thread.

**Query:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `after` | ISO datetime | — | optional cursor |
| `limit` | int | `50` | max `100` |

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Messages fetched",
  "messages": [
    {
      "id": "...",
      "type": "...",
      "messageType": "...",
      "text": "...",
      "attachmentUrl": null,
      "sender": "...",
      "senderId": "...",
      "senderName": "...",
      "senderImage": null,
      "offer": null,
      "createdAt": "...",
      "time": "..."
    }
  ]
}
```

---

### `GET /api/factory-offers/orders`

Same factory-conversion order list as `/api/factory/orders` (query schema shared). Role decides factory vs supplier list view.

---

### `POST /api/factory-offers/:offerId/pay`

**Supplier only** (documented for flow completeness). Demo pay creates a `FACTORY_CONVERSION` order.

**Response `200`:** `offer`, `chatMessage`, `order`, `checkout`, `message: "Demo payment confirmed. Factory chat order created."`.

---

## 8. Commission invoices

Base: `/api/factory/commission-invoices`  
Auth: Bearer + `factory`  

Scoped to non-cancelled orders where this factory is the seller.  
Invoice id format: `CI-` + order number without `ORD-` prefix.

### `GET /api/factory/commission-invoices`

**Query filters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | optional |
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
      "amount": 285,
      "date": "2024-05-28"
    }
  ],
  "pagination": {}
}
```

---

### `GET /api/factory/commission-invoices/:invoiceId`

**Response `200`:**

```json
{
  "success": true,
  "statusCode": 200,
  "id": "CI-...",
  "type": "Invoice",
  "orderId": "ORD-...",
  "customer": "...",
  "amount": 0,
  "date": "...",
  "orderTotal": 0,
  "commissionPercent": 0,
  "partyPayout": 0
}
```

---

### `GET /api/factory/commission-invoices/:invoiceId/pdf`

**Response:** PDF binary download.

---

## Quick route index

| Area | Method | Route |
|---|---|---|
| Auth | `POST` | `/api/auth/register/factory` |
| Auth | `POST` | `/api/auth/login/factory` |
| Dashboard | `GET` | `/api/factory/dashboard` |
| Profile | `GET` | `/api/factory/profile` |
| Profile | `PATCH` | `/api/factory/profile` |
| Profile | `PUT` | `/api/factory/profile/warehouses` |
| Profile | `POST` | `/api/factory/profile/password` |
| Profile | `PUT` | `/api/factory/profile/iban` |
| Products | `GET` | `/api/factory/products` |
| Products | `POST` | `/api/factory/products/ai-generate` |
| Products | `POST` | `/api/factory/products` |
| Products | `GET` | `/api/factory/products/csv-template` |
| Products | `GET` | `/api/factory/products/csv-category-guide` |
| Products | `POST` | `/api/factory/products/csv-upload` |
| Products | `GET` | `/api/factory/products/:id` |
| Products | `PATCH` | `/api/factory/products/:id` |
| Products | `POST` | `/api/factory/products/:id/resubmit` |
| Products | `POST` | `/api/factory/products/:id/cancel` |
| Products | `DELETE` | `/api/factory/products/:id` |
| Orders | `GET` | `/api/factory/orders/companies` |
| Orders | `GET` | `/api/factory/orders` |
| Orders | `GET` | `/api/factory/orders/:id` |
| Orders | `PATCH` | `/api/factory/orders/:id/status` |
| Auctions | `GET` | `/api/factory/auctions/order/:orderId` |
| Auctions | `POST` | `/api/factory/auctions` |
| Auctions | `GET` | `/api/factory/auctions/active` |
| Auctions | `GET` | `/api/factory/auctions/assigned` |
| Auctions | `GET` | `/api/factory/auctions/active/:id` |
| Auctions | `GET` | `/api/factory/auctions/assigned/:id` |
| Offers | `POST` | `/api/factory-offers` |
| Offers | `GET` | `/api/factory-offers/threads/:threadId/messages` |
| Offers | `GET` | `/api/factory-offers/orders` |
| Invoices | `GET` | `/api/factory/commission-invoices` |
| Invoices | `GET` | `/api/factory/commission-invoices/:invoiceId` |
| Invoices | `GET` | `/api/factory/commission-invoices/:invoiceId/pdf` |

> There is **no** factory wallet / payments-payouts API (unlike transporter). Closest money surfaces: dashboard revenue, offer/order amounts, and commission invoices.

---

## Related (supplier-facing, not factory role)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/supplier/factory-products` | Approved factory catalog |
| `GET` | `/api/supplier/factory-products/:id` | Catalog detail |
| `GET` / `DELETE` | `/api/supplier/factory-orders` | Buyer view of factory conversion orders |
| `GET` | `/api/supplier/factory-orders/factories` | Factory filter options |
| `POST` | `/api/factory-offers/:offerId/pay` | Supplier demo-pays an offer |

---

## Postman

Collection: `backend/postman/CONSTRUPRECO_API.postman_collection.json`

Folders:

- **Auth → Login → Factory**
- **Auth → Register → Factory**
- **Dashboard → Factory** → Dashboard Overview, Profile, Commission Invoices, Offers (to Supplier), Orders (from Supplier), Shipment Auctions, Products

Demo login (after seed): `factory@test.local` / `Password123!`
