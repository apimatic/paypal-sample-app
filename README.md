# PayPal Instant Storefront

A lightweight Node.js/Express web app that lets you create products and generate shareable checkout links with integrated PayPal Smart Payment Buttons. Built for **PayPal Sandbox** testing.

## Features

- **Credential Setup** — Enter your PayPal Sandbox Client ID and Secret, validated automatically against the PayPal API
- **Product Management** — Create products with a name, description, price, currency, and up to 5 images
- **Shareable Checkout Links** — Each product gets a unique `/checkout/:id` URL with embedded PayPal buttons
- **Server-Side Order Processing** — Orders are created and captured on the server via the PayPal Orders API (no client-side secrets exposed)
- **Payment History** — View all completed payments with buyer details, amounts, and capture IDs
- **Dashboard** — Overview of products, sales count, and total revenue

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express
- **PayPal SDK:** `paypal-apimatic-sdk`
- **File Uploads:** Multer (images stored in `uploads/`)
- **Data Storage:** In-memory (resets on server restart)

## Prerequisites

- Node.js 18+
- A [PayPal Developer](https://developer.paypal.com/) account with a Sandbox app created
- Sandbox Client ID and Client Secret from the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox)

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Build the TypeScript source**

   ```bash
   npm run build
   ```

3. **Start the server**

   ```bash
   npm start
   ```

   Or build and start in one step:

   ```bash
   npm run dev
   ```

4. **Open your browser** at [http://localhost:3000](http://localhost:3000)

5. **Configure credentials** — You'll be redirected to `/setup` where you enter your PayPal Sandbox Client ID and Secret. The app validates them by creating a test order against the PayPal API.

## Usage

1. **Create a product** — Go to `/products/new`, fill in the details, and upload images.
2. **Copy the checkout link** — From the dashboard, copy the generated checkout URL for any product.
3. **Share the link** — Send the checkout URL to a buyer. They'll see the product details and PayPal payment buttons.
4. **Test a payment** — Use a [PayPal Sandbox buyer account](https://developer.paypal.com/dashboard/accounts) to complete a test purchase.
5. **View payments** — Check `/payments` for a history of all completed transactions.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/orders` | Create a PayPal order for a product |
| `POST` | `/api/orders/:orderId/capture` | Capture an approved PayPal order |

## Project Structure

```
├── src/
│   └── server.ts        # Application source (routes, PayPal integration, HTML templates)
├── uploads/             # Product images (created at runtime)
├── dist/                # Compiled JavaScript output
├── package.json
└── tsconfig.json
```

## Notes

- This app runs in **Sandbox mode only** — no real money is charged.
- All data (products, payments, credentials) is stored **in memory** and will be lost when the server restarts.
- The server listens on port `3000` by default. Set the `PORT` environment variable to change it.

## License

ISC
