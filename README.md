# ShopEase Cebu Go — Full-stack MVP

A runnable starter for a local shopping + motorcycle delivery + pasabuy platform.

## Included
- Responsive ShopEase marketplace homepage with category shortcuts, local promos, and mobile quick navigation
- Expanded Cebu-focused product catalog across food, groceries, home, fashion, beauty, electronics, sports, pets, baby, and books, with featured local picks
- Responsive sign-in and sign-up with OTP login, signup verification, and password reset in local demo mode
- Customer registration/login (JWT)
- Product catalogue and cart
- Marketplace purchase flow with item selection, quantity controls, Buy Now, discount codes, and shipping/payment checkout
- Checkout with pickup/delivery details
- Delivery request creation
- Customer order history
- Rider order queue and status updates
- Admin order overview
- Customer profiles, product favorites, ratings, and reviews
- Product details, customer order details, and delivery status timeline
- Scheduled orders, order cancellation, and delivery handoff PINs
- Opt-in rider GPS sharing for active trips with customer-only live order tracking
- Rider registration, admin verification, availability, and request acceptance
- Merchant registration, store approval/profile, inventory management, order processing, and sales summary
- Product sorting and stock checks at checkout
- Support tickets, administrator replies, and notification read states
- Administrator delivery-fee and commission settings, manual payment review, and coupon management
- Customer coupon validation and discount calculation at checkout
- About, Contact, Terms, and Privacy information pages
- Browser location coordinates for pickup, external map directions, and local-only live trip tracking
- MySQL/MariaDB database with demo products and demo accounts
- Importable MySQL ecommerce schema and a one-time migration from the existing SQLite database

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL/MariaDB (`mysql2`)
- Authentication: bcrypt + JWT

## Requirements
- Node.js 20 (required by the one-time SQLite data migration utility)
- XAMPP MySQL/MariaDB or another MySQL-compatible server
- npm

## Run locally

### 1) Prepare the database
Start MySQL in XAMPP, open phpMyAdmin, create/select `shopee_ecommerce`, then import `server/shopee_ecommerce.sql`.

In the `server` folder, copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for your local database. The example uses XAMPP's default `root` account with no password; change it if your MySQL installation uses different credentials.

The API creates its namespaced `app_*` compatibility tables in the same database on startup. The imported Shopee tables remain untouched.

To preserve existing local SQLite records, run this once before starting the API:
```powershell
Set-Location "$HOME\Downloads\ShopEase CebuGo\server"
npm install
npm run migrate:sqlite
```
The original `server\shopease.sqlite` file is retained.

### 2) Start the API
```powershell
Set-Location "$HOME\Downloads\ShopEase CebuGo\server"
npm run dev
```
API runs at http://localhost:4000

### 3) Start the website
In another terminal:
```powershell
Set-Location "$HOME\Downloads\ShopEase CebuGo"
npm install
npm run dev
```
The React app runs at http://localhost:5173. Its React components and styles live in `src`.

Vite proxies `/api` to the backend.

## Demo accounts
All demo accounts use password: `password123`
- Customer: `customer@shopease.local`
- Rider: `rider@shopease.local`
- Merchant: `merchant@shopease.local`
- Admin: `admin@shopease.local`

## Important before real launch
This is an MVP starter, not a production deployment. Configure a strong `JWT_SECRET`, HTTPS, rate limiting, audit logs, password reset/email verification, account deletion and privacy-consent flows, image storage, delivery-zone pricing, and production access controls before launch.

OTP codes are generated and displayed in the app only outside production so the flow can be tested locally. No SMS or email is sent. Configure a real OTP delivery provider before production; the API intentionally rejects OTP requests when `NODE_ENV=production` until provider delivery is implemented.

GCash/Maya references can be reviewed manually, but no payment gateway, automatic verification, refund, or payout is connected. Coupons, fees, and commission are local demo settings. Pickup location can use browser geolocation, and rider directions open Google Maps. Riders can explicitly share their current GPS location for an active assigned trip; only the customer who owns that order can view it, and coordinates are not sent to an external map provider. Coordinates are cleared when sharing stops, and stale location records are cleaned up after five minutes without an update. Browser GPS requires permission and a secure context (HTTPS, except on localhost). There is no geocoding, route optimization, or rider assignment automation. Email/SMS/push delivery, chat, mobile apps, subscriptions, referrals, loyalty points, recommendations, fraud detection, and multi-city operation are not implemented. Do not store card details or sensitive personal data. Add business registration, permits, insurance, and local legal review before operating deliveries.

