import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  CustomError,
  Environment,
  ItemCategory,
  OrdersController,
} from 'paypal-apimatic-sdk';

// ── Types ────────────────────────────────────────────────────────────────────

interface AppConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox';
  validated: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  createdAt: string;
}

interface Payment {
  orderId: string;
  productId: string;
  productName: string;
  payerEmail: string;
  payerName: string;
  amount: string;
  currency: string;
  status: string;
  captureId: string;
  completedAt: string;
}

// ── In-memory store ──────────────────────────────────────────────────────────

let config: AppConfig | null = null;
const products: Map<string, Product> = new Map();
const payments: Payment[] = [];

// ── Express setup ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helper: get PayPal client ────────────────────────────────────────────────

function getPayPalClient(): Client {
  if (!config) throw new Error('PayPal not configured');
  return new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: config.clientId,
      oAuthClientSecret: config.clientSecret,
    },
    timeout: 0,
    environment: Environment.Sandbox,
  });
}

// ── Helper: common page layout ───────────────────────────────────────────────

function layout(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - PayPal Instant Storefront</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #1a1a2e; line-height: 1.6; }
    .navbar { background: #003087; color: white; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .navbar h1 { font-size: 20px; font-weight: 700; }
    .navbar nav a { color: rgba(255,255,255,0.9); text-decoration: none; margin-left: 24px; font-size: 14px; font-weight: 500; }
    .navbar nav a:hover { color: white; }
    .container { max-width: 1100px; margin: 32px auto; padding: 0 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 32px; margin-bottom: 24px; }
    .card h2 { font-size: 22px; margin-bottom: 20px; color: #003087; }
    label { display: block; font-weight: 600; margin-bottom: 6px; margin-top: 16px; font-size: 14px; color: #333; }
    input[type="text"], input[type="password"], input[type="number"], input[type="file"], select, textarea {
      width: 100%; padding: 10px 14px; border: 1.5px solid #d0d5dd; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #003087; box-shadow: 0 0 0 3px rgba(0,48,135,0.1); }
    textarea { resize: vertical; min-height: 80px; }
    .btn { display: inline-block; padding: 12px 28px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s; }
    .btn-primary { background: #003087; color: white; }
    .btn-primary:hover { background: #002060; }
    .btn-secondary { background: #0070ba; color: white; }
    .btn-secondary:hover { background: #005ea6; }
    .btn-sm { padding: 8px 16px; font-size: 13px; }
    .alert { padding: 14px 20px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
    .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .alert-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e9ecef; font-size: 14px; }
    th { background: #f8f9fa; font-weight: 600; color: #495057; }
    tr:hover { background: #f8f9fa; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-green { background: #d4edda; color: #155724; }
    .badge-blue { background: #d1ecf1; color: #0c5460; }
    .badge-yellow { background: #fff3cd; color: #856404; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
    .product-card { background: white; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; transition: transform 0.2s; }
    .product-card:hover { transform: translateY(-2px); }
    .product-card img { width: 100%; height: 200px; object-fit: cover; }
    .product-card .no-img { width: 100%; height: 200px; background: #e9ecef; display: flex; align-items: center; justify-content: center; color: #6c757d; font-size: 14px; }
    .product-card .info { padding: 20px; }
    .product-card .info h3 { font-size: 18px; margin-bottom: 8px; }
    .product-card .info .price { font-size: 24px; font-weight: 700; color: #003087; margin: 8px 0; }
    .product-card .info p { color: #6c757d; font-size: 14px; margin-bottom: 12px; }
    .link-box { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .link-box input { flex: 1; font-size: 13px; padding: 8px 12px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; }
    .link-box button { padding: 8px 14px; font-size: 13px; background: #003087; color: white; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap; }
    .checkout-page { max-width: 600px; margin: 40px auto; padding: 0 20px; }
    .checkout-product { text-align: center; }
    .checkout-product img { max-width: 100%; max-height: 350px; object-fit: contain; border-radius: 12px; margin-bottom: 20px; }
    .checkout-product h2 { font-size: 26px; margin-bottom: 8px; }
    .checkout-product .price { font-size: 32px; font-weight: 700; color: #003087; margin: 12px 0; }
    .checkout-product .desc { color: #6c757d; font-size: 15px; margin-bottom: 24px; }
    #paypal-button-container { margin-top: 24px; }
    .confirmation { text-align: center; padding: 40px 20px; }
    .confirmation .checkmark { font-size: 64px; color: #28a745; margin-bottom: 16px; }
    .confirmation h2 { font-size: 28px; margin-bottom: 12px; color: #155724; }
    .confirmation .details { text-align: left; margin: 24px auto; max-width: 400px; }
    .confirmation .details div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e9ecef; }
    .confirmation .details .label { font-weight: 600; color: #495057; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 28px; }
    .stat-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }
    .stat-card .number { font-size: 32px; font-weight: 700; color: #003087; }
    .stat-card .label { font-size: 14px; color: #6c757d; margin-top: 4px; }
    .empty-state { text-align: center; padding: 40px; color: #6c757d; }
    .mt-16 { margin-top: 16px; }
    .mt-24 { margin-top: 24px; }
    .sandbox-banner { background: #ff9800; color: white; text-align: center; padding: 8px 16px; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; }
    .sandbox-badge { display: inline-block; background: #ff9800; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 8px; vertical-align: middle; }
    .img-preview { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .img-preview img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #dee2e6; }
  </style>
  ${extraHead}
</head>
<body>
  ${config?.validated ? '<div class="sandbox-banner">SANDBOX MODE — Test payments only. No real money is charged.</div>' : ''}
  <div class="navbar">
    <h1>PayPal Instant Storefront <span class="sandbox-badge">SANDBOX</span></h1>
    <nav>
      ${config?.validated ? '<a href="/dashboard">Dashboard</a><a href="/products/new">New Product</a><a href="/payments">Payments</a><a href="/setup">Settings</a>' : '<a href="/setup">Setup</a>'}
    </nav>
  </div>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Root redirect
app.get('/', (_req: Request, res: Response) => {
  if (!config || !config.validated) return res.redirect('/setup');
  res.redirect('/dashboard');
});

// ── Setup Page ───────────────────────────────────────────────────────────────

app.get('/setup', (req: Request, res: Response) => {
  const message = req.query.message as string | undefined;
  const error = req.query.error as string | undefined;

  const html = layout('Setup', `
    <div class="card">
      <h2>PayPal Sandbox Configuration</h2>
      <p style="color: #6c757d; margin-bottom: 20px;">Enter your <strong>Sandbox</strong> API credentials to get started. Get them from the <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank">PayPal Developer Dashboard</a> under your sandbox app.</p>
      ${config?.validated ? '<div class="alert alert-success">PayPal Sandbox credentials are verified and working.</div>' : ''}
      ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ''}
      ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
      <form method="POST" action="/setup">
        <label for="clientId">Sandbox Client ID</label>
        <input type="text" id="clientId" name="clientId" value="${config?.clientId || ''}" required placeholder="e.g. AX3d...your sandbox client ID">

        <label for="clientSecret">Sandbox Client Secret</label>
        <input type="password" id="clientSecret" name="clientSecret" value="${config?.clientSecret || ''}" required placeholder="e.g. EK2x...your sandbox secret">

        <div class="alert alert-info" style="margin-top: 16px;">
          <strong>Sandbox Mode:</strong> This app uses PayPal Sandbox for safe testing. No real money is charged.
          Use sandbox buyer accounts (from <a href="https://developer.paypal.com/dashboard/accounts" target="_blank">Sandbox Accounts</a>) to test payments.
        </div>

        <div class="mt-24">
          <button type="submit" class="btn btn-primary">Save &amp; Verify Credentials</button>
        </div>
      </form>
    </div>
  `);
  res.send(html);
});

app.post('/setup', async (req: Request, res: Response) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.redirect('/setup?error=Client ID and Secret are required');
  }

  const trimmedId = clientId.trim();
  const trimmedSecret = clientSecret.trim();

  // Validate credentials by attempting to create and immediately use the client
  try {
    const testClient = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: trimmedId,
        oAuthClientSecret: trimmedSecret,
      },
      timeout: 0,
      environment: Environment.Sandbox,
    });

    // Make a lightweight test call — create a minimal $0.01 order then we know creds work
    const ordersController = new OrdersController(testClient);
    const testCollect = {
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: {
              currencyCode: 'USD',
              value: '0.01',
            },
          },
        ],
      },
      prefer: 'return=minimal',
    };
    const testResponse = await ordersController.createOrder(testCollect);

    if (testResponse.result && testResponse.result.id) {
      config = {
        clientId: trimmedId,
        clientSecret: trimmedSecret,
        environment: 'sandbox',
        validated: true,
      };
      return res.redirect('/dashboard');
    }

    return res.redirect('/setup?error=Credentials did not return a valid response. Please check them.');
  } catch (error) {
    let errorMsg = 'Failed to validate credentials with PayPal Sandbox.';
    if (error instanceof ApiError) {
      if (error.statusCode === 401) {
        errorMsg = 'Invalid credentials — Client ID or Secret is wrong. Make sure you are using Sandbox credentials (not Live).';
      } else {
        errorMsg = `PayPal returned error ${error.statusCode}. Double-check your Sandbox credentials.`;
      }
    }
    // Preserve what they entered so they don't have to retype
    config = {
      clientId: trimmedId,
      clientSecret: trimmedSecret,
      environment: 'sandbox',
      validated: false,
    };
    return res.redirect(`/setup?error=${encodeURIComponent(errorMsg)}`);
  }
});

// ── Dashboard ────────────────────────────────────────────────────────────────

app.get('/dashboard', (req: Request, res: Response) => {
  if (!config || !config.validated) return res.redirect('/setup');

  const productList = Array.from(products.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const totalRevenue = payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;

  let productCards = '';
  if (productList.length === 0) {
    productCards = `<div class="empty-state">
      <p>No products yet.</p>
      <a href="/products/new" class="btn btn-primary mt-16">Create Your First Product</a>
    </div>`;
  } else {
    productCards = '<div class="product-grid">';
    for (const p of productList) {
      const checkoutUrl = `${baseUrl}/checkout/${p.id}`;
      const productPayments = payments.filter((pay) => pay.productId === p.id && pay.status === 'COMPLETED').length;
      productCards += `
        <div class="product-card">
          ${p.images.length > 0 ? `<img src="/uploads/${p.images[0]}" alt="${escapeHtml(p.name)}">` : '<div class="no-img">No image</div>'}
          <div class="info">
            <h3>${escapeHtml(p.name)}</h3>
            <div class="price">${escapeHtml(p.currency)} ${escapeHtml(p.price)}</div>
            <p>${escapeHtml(p.description.substring(0, 100))}${p.description.length > 100 ? '...' : ''}</p>
            <span class="badge badge-green">${productPayments} sale${productPayments !== 1 ? 's' : ''}</span>
            <div class="link-box">
              <input type="text" value="${checkoutUrl}" readonly id="link-${p.id}">
              <button onclick="navigator.clipboard.writeText(document.getElementById('link-${p.id}').value)">Copy</button>
            </div>
          </div>
        </div>`;
    }
    productCards += '</div>';
  }

  const html = layout('Dashboard', `
    <div class="stats">
      <div class="stat-card">
        <div class="number">${productList.length}</div>
        <div class="label">Products</div>
      </div>
      <div class="stat-card">
        <div class="number">${payments.filter((p) => p.status === 'COMPLETED').length}</div>
        <div class="label">Completed Sales</div>
      </div>
      <div class="stat-card">
        <div class="number">$${totalRevenue.toFixed(2)}</div>
        <div class="label">Total Revenue</div>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin-bottom: 0;">Your Products</h2>
        <a href="/products/new" class="btn btn-secondary btn-sm">+ New Product</a>
      </div>
      ${productCards}
    </div>
  `);
  res.send(html);
});

// ── Create Product ───────────────────────────────────────────────────────────

app.get('/products/new', (_req: Request, res: Response) => {
  if (!config || !config.validated) return res.redirect('/setup');

  const html = layout('New Product', `
    <div class="card">
      <h2>Create New Product</h2>
      <form method="POST" action="/products" enctype="multipart/form-data">
        <label for="name">Product Name</label>
        <input type="text" id="name" name="name" required placeholder="e.g. Premium Widget">

        <label for="description">Description</label>
        <textarea id="description" name="description" required placeholder="Describe your product..."></textarea>

        <label for="price">Price</label>
        <input type="text" id="price" name="price" required placeholder="29.99" pattern="^\\d+(\\.\\d{1,2})?$" title="Enter a valid price (e.g. 29.99)">

        <label for="currency">Currency</label>
        <select id="currency" name="currency">
          <option value="USD">USD - US Dollar</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - British Pound</option>
          <option value="CAD">CAD - Canadian Dollar</option>
          <option value="AUD">AUD - Australian Dollar</option>
          <option value="JPY">JPY - Japanese Yen</option>
        </select>

        <label for="images">Product Images (max 5)</label>
        <input type="file" id="images" name="images" multiple accept="image/*">

        <div class="mt-24">
          <button type="submit" class="btn btn-primary">Create Product & Generate Checkout Link</button>
        </div>
      </form>
    </div>
  `);
  res.send(html);
});

app.post('/products', upload.array('images', 5), (req: Request, res: Response) => {
  if (!config || !config.validated) return res.redirect('/setup');

  const { name, description, price, currency } = req.body;
  if (!name || !price) return res.redirect('/products/new');

  const files = req.files as Express.Multer.File[];
  const imageFilenames = files ? files.map((f) => f.filename) : [];

  const product: Product = {
    id: uuidv4().substring(0, 8),
    name: name.trim(),
    description: (description || '').trim(),
    price: parseFloat(price).toFixed(2),
    currency: currency || 'USD',
    images: imageFilenames,
    createdAt: new Date().toISOString(),
  };

  products.set(product.id, product);
  res.redirect('/dashboard');
});

// ── Public Checkout Page ─────────────────────────────────────────────────────

app.get('/checkout/:productId', (req: Request, res: Response) => {
  const product = products.get(req.params.productId);
  if (!product || !config || !config.validated) {
    return res.status(404).send(layout('Not Found', `
      <div class="card" style="text-align: center;">
        <h2>Product Not Found</h2>
        <p style="color: #6c757d;">This checkout link is invalid or the product no longer exists.</p>
      </div>
    `));
  }

  let imagesHtml = '';
  if (product.images.length > 0) {
    imagesHtml = `<img src="/uploads/${product.images[0]}" alt="${escapeHtml(product.name)}">`;
    if (product.images.length > 1) {
      imagesHtml += '<div class="img-preview" style="justify-content: center; margin-top: 12px;">';
      for (const img of product.images) {
        imagesHtml += `<img src="/uploads/${img}" alt="${escapeHtml(product.name)}" style="cursor: pointer;" onclick="document.querySelector('.checkout-product > img').src = this.src">`;
      }
      imagesHtml += '</div>';
    }
  }

  const html = layout('Checkout', `
    <div class="checkout-page">
      <div class="card checkout-product">
        ${imagesHtml}
        <h2>${escapeHtml(product.name)}</h2>
        <div class="price">${escapeHtml(product.currency)} ${escapeHtml(product.price)}</div>
        <div class="desc">${escapeHtml(product.description)}</div>
        <hr style="border: none; border-top: 1px solid #e9ecef; margin: 20px 0;">
        <div id="paypal-button-container"></div>
        <div id="result-message" style="margin-top: 16px;"></div>
        <p style="margin-top: 16px; font-size: 12px; color: #999;">Sandbox Mode — Use a <a href="https://developer.paypal.com/dashboard/accounts" target="_blank" style="color: #0070ba;">sandbox buyer account</a> to test.</p>
      </div>
    </div>
  `, `<script src="https://www.sandbox.paypal.com/sdk/js?client-id=${config.clientId}&currency=${product.currency}&intent=capture"></script>
  <script>
    paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' },
      createOrder: async function() {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: '${product.id}' })
        });
        const data = await res.json();
        if (data.id) return data.id;
        throw new Error(data.error || 'Could not create order');
      },
      onApprove: async function(data) {
        const res = await fetch('/api/orders/' + data.orderID + '/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: '${product.id}' })
        });
        const orderData = await res.json();
        if (orderData.status === 'COMPLETED') {
          window.location.href = '/confirmation/' + orderData.id + '?productId=${product.id}';
        } else {
          document.getElementById('result-message').innerHTML =
            '<div class="alert alert-error">Payment was not completed. Status: ' + orderData.status + '</div>';
        }
      },
      onError: function(err) {
        document.getElementById('result-message').innerHTML =
          '<div class="alert alert-error">Payment error. Please try again.</div>';
        console.error(err);
      }
    }).render('#paypal-button-container');
  </script>`);
  res.send(html);
});

// ── API: Create Order (server-side) ──────────────────────────────────────────

app.post('/api/orders', async (req: Request, res: Response) => {
  try {
    if (!config) return res.status(500).json({ error: 'PayPal not configured' });

    const { productId } = req.body;
    const product = products.get(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const client = getPayPalClient();
    const ordersController = new OrdersController(client);

    const collect = {
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: {
              currencyCode: product.currency,
              value: product.price,
              breakdown: {
                itemTotal: {
                  currencyCode: product.currency,
                  value: product.price,
                },
              },
            },
            description: product.name,
            items: [
              {
                name: product.name,
                unitAmount: {
                  currencyCode: product.currency,
                  value: product.price,
                },
                quantity: '1',
                description: product.description.substring(0, 127),
                category: ItemCategory.DigitalGoods,
              },
            ],
          },
        ],
      },
      prefer: 'return=representation',
    };

    const response = await ordersController.createOrder(collect);

    if (response.result && response.result.id) {
      return res.json({ id: response.result.id, status: response.result.status });
    }
    return res.status(500).json({ error: 'Failed to create order' });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('PayPal API Error:', error.statusCode, error.body);
      if (error instanceof CustomError) {
        return res.status(error.statusCode).json({ error: 'PayPal error', details: error.result });
      }
      return res.status(error.statusCode).json({ error: 'PayPal API error' });
    }
    console.error('Error creating order:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── API: Capture Order (server-side) ─────────────────────────────────────────

app.post('/api/orders/:orderId/capture', async (req: Request, res: Response) => {
  try {
    if (!config) return res.status(500).json({ error: 'PayPal not configured' });

    const { orderId } = req.params;
    const { productId } = req.body;
    const product = products.get(productId);

    const client = getPayPalClient();
    const ordersController = new OrdersController(client);

    const collect = {
      id: orderId,
      prefer: 'return=representation',
    };

    const response = await ordersController.captureOrder(collect);
    const order = response.result;

    if (order) {
      // Extract payer info
      let payerEmail = '';
      let payerName = '';

      if (order.paymentSource) {
        const ps = order.paymentSource;
        if (ps.paypal) {
          payerEmail = ps.paypal.emailAddress || '';
          if (ps.paypal.name) {
            payerName = [ps.paypal.name.givenName, ps.paypal.name.surname].filter(Boolean).join(' ');
          }
        }
      }

      // Extract capture ID
      let captureId = '';
      let capturedAmount = '';
      let capturedCurrency = '';

      if (order.purchaseUnits) {
        for (const pu of order.purchaseUnits) {
          if (pu.payments && pu.payments.captures) {
            for (const capture of pu.payments.captures) {
              if (capture.id) captureId = capture.id;
              if (capture.amount) {
                capturedAmount = capture.amount.value || '';
                capturedCurrency = capture.amount.currencyCode || '';
              }
            }
          }
        }
      }

      // Store payment record
      if (order.status === 'COMPLETED') {
        payments.push({
          orderId: order.id || orderId,
          productId: productId || '',
          productName: product?.name || 'Unknown',
          payerEmail,
          payerName,
          amount: capturedAmount || product?.price || '',
          currency: capturedCurrency || product?.currency || '',
          status: order.status,
          captureId,
          completedAt: new Date().toISOString(),
        });
      }

      return res.json({
        id: order.id,
        status: order.status,
        payerEmail,
        payerName,
        captureId,
      });
    }

    return res.status(500).json({ error: 'Failed to capture order' });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('PayPal Capture Error:', error.statusCode, error.body);
      if (error instanceof CustomError) {
        return res.status(error.statusCode).json({ error: 'PayPal error', details: error.result });
      }
      return res.status(error.statusCode).json({ error: 'PayPal API error' });
    }
    console.error('Error capturing order:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Confirmation Page ────────────────────────────────────────────────────────

app.get('/confirmation/:orderId', (req: Request, res: Response) => {
  const { orderId } = req.params;
  const productId = req.query.productId as string;
  const product = products.get(productId);
  const payment = payments.find((p) => p.orderId === orderId);

  const html = layout('Payment Confirmed', `
    <div class="card confirmation">
      <div class="checkmark">&#10003;</div>
      <h2>Payment Successful!</h2>
      <p style="color: #6c757d; margin-bottom: 24px;">Thank you for your purchase. Your order has been confirmed.</p>
      <div class="details">
        <div><span class="label">Order ID</span><span>${escapeHtml(orderId)}</span></div>
        ${payment ? `<div><span class="label">Capture ID</span><span>${escapeHtml(payment.captureId)}</span></div>` : ''}
        ${product ? `<div><span class="label">Product</span><span>${escapeHtml(product.name)}</span></div>` : ''}
        ${payment ? `<div><span class="label">Amount</span><span>${escapeHtml(payment.currency)} ${escapeHtml(payment.amount)}</span></div>` : ''}
        ${payment ? `<div><span class="label">Status</span><span class="badge badge-green">${escapeHtml(payment.status)}</span></div>` : ''}
        ${payment?.payerEmail ? `<div><span class="label">Payer</span><span>${escapeHtml(payment.payerEmail)}</span></div>` : ''}
      </div>
    </div>
  `);
  res.send(html);
});

// ── Payments List ────────────────────────────────────────────────────────────

app.get('/payments', (_req: Request, res: Response) => {
  if (!config || !config.validated) return res.redirect('/setup');

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  let tableRows = '';
  if (sortedPayments.length === 0) {
    tableRows = '<tr><td colspan="7" style="text-align: center; color: #6c757d; padding: 32px;">No payments yet.</td></tr>';
  } else {
    for (const p of sortedPayments) {
      tableRows += `<tr>
        <td>${escapeHtml(p.orderId)}</td>
        <td>${escapeHtml(p.productName)}</td>
        <td>${escapeHtml(p.payerName || '-')}</td>
        <td>${escapeHtml(p.payerEmail || '-')}</td>
        <td>${escapeHtml(p.currency)} ${escapeHtml(p.amount)}</td>
        <td><span class="badge badge-green">${escapeHtml(p.status)}</span></td>
        <td>${new Date(p.completedAt).toLocaleString()}</td>
      </tr>`;
    }
  }

  const html = layout('Payments', `
    <div class="card">
      <h2>Payment History</h2>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Product</th>
              <th>Buyer Name</th>
              <th>Buyer Email</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `);
  res.send(html);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PayPal Instant Storefront running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/setup to configure your PayPal credentials`);
});
