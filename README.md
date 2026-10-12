# TradeWise-inspired Demo Platform

Original-branded responsive trading-style simulator with PostgreSQL-backed registration/login, a virtual trading interface, admin summary endpoint, payment-record scaffolding, and Render Blueprint configuration.

## Safety and payment status
This is an educational demo, **not a licensed broker**. Live binary-options trading, real-money balances, deposits and withdrawals are not implemented. Payment endpoints are disabled by default and only create pending records if deliberately enabled; they do not call M-Pesa or Stripe and never credit balances. The M-Pesa callback is intentionally a stub.

Before accepting live payments or offering financial products, obtain applicable legal authorization and provider approval, implement provider-specific signed webhook verification and idempotent reconciliation, and complete fraud/AML, privacy, refund, and security reviews. Provider approval alone does not authorize regulated trading products.

## Deploy from Android
1. Download and extract the ZIP.
2. Create a GitHub repository, e.g. `tradewise-inspired`.
3. Upload the **extracted contents** to the repository root. Confirm `package.json`, `render.yaml`, `src/`, and `public/` appear at the top level.
4. In Render, choose **New + → Blueprint**, connect GitHub, and select this repository.
5. Review the `tradewise-inspired` web service and `tradewise-db` database from `render.yaml`, then deploy.
6. Set `ADMIN_EMAIL` in Render before creating the intended admin account. Keep `PAYMENTS_ENABLED=false`.
7. Test `https://YOUR-SERVICE.onrender.com/api/health` — it should return JSON with `ok: true`.

## Local run
Requires Node.js 20+ and PostgreSQL. Copy `.env.example` to `.env`, configure `DATABASE_URL` and a strong `JWT_SECRET`, then run `npm install` and `npm start`. Visit `http://localhost:10000`.

## Included API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me` (Bearer token)
- `POST /api/demo/reset` (Bearer token)
- `POST /api/payments/intent` (Bearer token; disabled by default)
- `GET /api/payments/history` (Bearer token)
- `GET /api/admin/summary` (admin Bearer token)

## Payment integration roadmap
- **M-Pesa Daraja:** configure approved credentials server-side; implement OAuth/STK Push, transaction status reconciliation, verified callbacks, replay protection, and idempotency.
- **Stripe:** use hosted Checkout for eligible businesses; verify webhook signatures and reconcile transaction status server-side.
- Never expose secret keys in frontend JavaScript or commit `.env`.
- Before production, add email verification, password reset, admin MFA, session revocation, monitoring, tests, backups, privacy/terms pages, and independent security testing.
