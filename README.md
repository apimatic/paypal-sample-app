# PayPal Orders API Sample Application

A lightweight Node.js/Express storefront that lets you create products and generate shareable checkout links with integrated PayPal Smart Payment Buttons — built entirely on the PayPal Sandbox.

This application uses the PayPal TypeScript SDK generated via [APIMatic's Code Generation Platform](<https://apimatic-poc-pp.pages.dev/>).

## Demo

| [Watch Video Demo](![output (1)](https://github.com/user-attachments/assets/4ea2bd6d-f869-499e-8dee-0280b9b15d5f)
)

## Features

- **One-Click Credential Setup** — Enter and validate your PayPal Sandbox Client ID and Secret directly in the browser
- **Product Management** — Create products with name, description, price, currency, and up to 5 images
- **Shareable Checkout Links** — Each product gets a unique URL with embedded PayPal Smart Payment Buttons
- **Server-Side Order Processing** — Orders are created and captured on the server via the PayPal Orders API (no client-side secrets exposed)
- **Payment History** — View all completed payments with buyer details, amounts, and capture IDs
- **Dashboard** — Overview of products, sales count, and total revenue

## Quick Start

### Prerequisites

- [PayPal Sandbox API credentials](https://developer.paypal.com/dashboard/applications/sandbox) (Client ID and Secret)
- Node.js 18+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/apimatic/paypal-instant-storefront.git
cd paypal-instant-storefront

# Install dependencies
npm install

# Build the TypeScript source
npm run build

# Run the app
npm start
```

Open [http://localhost:3000](http://localhost:3000) and enter your PayPal Sandbox credentials on the setup page to get started.

## How It Works

The app is a single Express/TypeScript server that renders all pages as server-side HTML. When you configure your Sandbox credentials, the server validates them by making a test order call to the PayPal API. Once validated, you can create products that are stored in memory, each assigned a unique checkout URL.

When a buyer visits a checkout link, the page loads the PayPal JS SDK and renders Smart Payment Buttons. Clicking "Pay" triggers a server-side `POST /api/orders` call that uses the `paypal-apimatic-sdk` to create an order with full item details and amount breakdowns. After the buyer approves, a `POST /api/orders/:orderId/capture` call captures the payment, extracts payer info and capture IDs from the response, and stores the payment record.

All state (credentials, products, payments) lives in memory, so it resets on server restart. Product images are saved to the `uploads/` directory via Multer. The entire app runs in Sandbox mode — no real money is ever charged.

## AI Generation Details

This application was generated using Claude Code with the APIMatic Context Plugin.

### Prompt Used

```
Build me a "PayPal Instant Storefront" app using the PayPal MCP server you have access to. The app has a setup page where I enter my PayPal client-id and secret once, then a product creation form where I enter a product name, description, price, currency, and upload or provide product images. When I click "Generate Checkout Page" it creates a live, shareable checkout URL like /checkout/abc123 that anyone can open — they see the product details with images, price, description, and a working PayPal Smart Payment Button. The payment flow should be fully server-side using the PayPal Server SDK: backend creates the order when buyer clicks pay, captures it after approval, and shows a confirmation page with order details. I should be able to create multiple products and each gets its own unique checkout link I can share with anyone. Include a simple dashboard where I can see all my products and their checkout links, plus a list of completed payments showing order ID, buyer info, amount, and status for each product. The checkout pages should be mobile-responsive and look like real professional product pages. Support sandbox and live mode via environment variables. Only use the Orders API and Payments API, do not use Transaction Search or Vault. Use the PayPal MCP server for all API details — server SDK methods, order creation and capture flow, request/response schemas — don't guess anything. Make it deployable with npm install and npm start.
```

### Time Investment

| Phase | Time |
|-------|------|
| Initial generation | `10 minutes` |
| Testing and refinement | `20 minutes` |

