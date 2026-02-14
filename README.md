# Hostel Food Ordering Website

Modern full-stack hostel ordering system built with React + Express.

## Features

- Browse categories: Maggi, Cold Drinks, Snacks, Biscuits
- Add items to cart and place orders from the website
- Checkout form with room number, phone, and payment method
- Recent orders panel
- Admin panel to manage orders
- Backend API for menu and orders
- File-based JSON database for persistent data
- Student login by Email or Google-style login
- Admin panel protected by PIN

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: JSON file at `server/data/db.json`

## Run Locally

```bash
npm install
npm run dev
```

This runs:

- Frontend at `http://localhost:5173`
- Backend API at `http://localhost:5000`

## API Endpoints

- `GET /api/health`
- `POST /api/auth/student/email-login`
- `POST /api/auth/student/google-login`
- `POST /api/auth/admin/login`
- `POST /api/auth/logout`
- `GET /api/menu`
- `GET /api/orders/my`
- `GET /api/orders/admin?limit=100`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `DELETE /api/orders/:id`

## Login Notes

- Student must login before ordering.
- Email login works directly.
- Google login is currently a demo flow (name/email/googleId input), not full OAuth.
- Admin panel requires PIN.
- Default admin PIN is `1234` (change by setting environment variable `ADMIN_PIN`).

## Order Payload Example

```json
{
  "customerName": "Rahul",
  "roomNumber": "B-204",
  "phone": "9876543210",
  "paymentMethod": "upi",
  "notes": "Less spicy",
  "items": [
    { "itemId": "m1", "quantity": 2 },
    { "itemId": "d1", "quantity": 1 }
  ]
}
```
