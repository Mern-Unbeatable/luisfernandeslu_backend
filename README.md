# CONSTRUPRECO-backend

Express + Prisma API for CONSTRUPRECO. ES modules + class-based `App` / `Server`.

## Structure

```
CONSTRUPRECO-backend/
├── src/
│   ├── routes/          # Feature routers (add as needed)
│   ├── controllers/     # Class-based controllers
│   ├── services/        # Class-based services
│   ├── app.js           # App class
│   └── server.js        # Server class (entry)
├── prisma/
│   └── schema/
│       └── schema.prisma
├── .env.example
└── package.json
```

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon |
| `npm start` | Production |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run migrations |
| `npm run prisma:studio` | Prisma Studio |

Schema is empty for now — add models in `prisma/schema/schema.prisma` as features land.
