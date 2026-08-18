# CONSTRUPRECO API

A modular Node.js backend API built with Express 5, Prisma 7, and PostgreSQL. The project follows a feature-based modular architecture with ES modules and OOP patterns.

## Tech Stack

- **Runtime:** Node.js 22+
- **Framework:** Express 5
- **ORM:** Prisma 7
- **Database:** PostgreSQL
- **Transpiler:** tsx (for Prisma 7 TypeScript client)
- **Package Manager:** pnpm

## Project Structure

```
backend/
├── src/
│   ├── app.js                     # Express app setup & middleware
│   ├── server.js                  # Server entry point
│   ├── modules/                   # Feature modules
│   │   └── user/
│   │       ├── routes/            # Route definitions
│   │       ├── controllers/       # Request handlers
│   │       └── services/          # Business logic
│   └── generated/                 # Prisma generated client (TS)
├── lib/
│   └── prisma.js                  # PrismaClient singleton with pg adapter
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Migration files
├── .env                           # Environment variables
├── .env.example                   # Example env file
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm
- PostgreSQL

### Installation

```bash
pnpm install
```

### Environment Setup

Copy `.env.example` to `.env` and update:

```env
DATABASE_URL="postgres://user:password@localhost:5432/construpreco"
PORT=3000
NODE_ENV=development
```

### Database Setup

```bash
# Generate Prisma Client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate

# Optional: Open Prisma Studio
pnpm prisma:studio
```

### Running the Server

```bash
# Development (watch mode)
pnpm dev

# Production
pnpm start
```

Server runs on `http://localhost:3000` by default.

## Architecture

- **Modules:** Each feature lives under `src/modules/<feature>/` with its own `routes/`, `controllers/`, and `services/`
- **ES Modules:** Native `import`/`export` (`"type": "module"` in package.json)
- **OOP:** Routes and controllers use ES classes
- **Prisma 7:** Uses driver adapter pattern (`@prisma/adapter-pg` + `pg`)

## Core Modules

- **User Management:** Authentication, roles (CUSTOMER, COMPANY, SUPPLIER, FACTORY, TRANSPORTER, AFFILIATE, ADMIN), profiles, addresses
- **Product Catalog:** Categories, products, media, pricing tiers, inventory
- **Orders & Projects:** Orders, installments, invoices, quotes, chat
- **Logistics:** Vehicles, shipments, auctions, transporter bids, tracking
- **Affiliate & Marketing:** Affiliate links, commissions, promo codes, ad campaigns
- **Financial:** Wallets, transactions, withdrawal requests, fiscal documents
- **Support & CMS:** Support tickets, blog posts, system settings, audit logs

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/` | API info |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |

## License

ISC
