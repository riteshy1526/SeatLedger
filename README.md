# SeatLedger | Multi-Tenant Library Management SaaS Platform

**SeatLedger** is a production-grade, multi-tenant MERN SaaS platform designed specifically for study halls and competitive exam libraries (with real-world pilot profiles for **Varanasi** and **Lucknow**).

**Existing Streamlit demo:** https://seatledger.streamlit.app

---

## 🌟 Key Features

1. **Multi-Tenant Architecture**:
   - Each library has its own isolated workspace, seat matrix, student roster, and fee ledger.
   - 1-Click pilot demo accounts for **Kashi Study Point (Varanasi)** and **Awadh Digital Library (Lucknow)**.

2. **Role-Based Access Control (RBAC)**:
   - **Library Admin**: Full control over occupancy, rates, staff, seat layout, and financial dashboards.
   - **Staff**: Daily desk operations, student check-in, seat assignment, and counter fee collection.
   - **Student**: Dedicated self-service portal to view assigned seat, fee dues, and pay online.

3. **Interactive Seat Matrix Management**:
   - Admins can add seats or remove any seat without active students assigned to it.
   - Later seat labels and student assignments shift automatically; removed seats remain reflected in public availability and student seat choices.

4. **Online Fee Payment with Razorpay**:
   - Integrated Razorpay checkout modal with order creation, signature verification, and webhook handling.
   - Instant receipt status updates and offline Cash/UPI counter collection.

5. **Automated Reminders (BullMQ + Redis)**:
   - Background worker queue for scheduled fee due reminders.
   - Multi-channel support: **WhatsApp** templates and **Email** dispatch with delivery audit trail.
   - In-process resilient fallback if Redis is not running locally.

6. **Executive Dashboard (Recharts)**:
   - Real-time occupancy rate gauges.
   - 6-month historical revenue trend (AreaChart).
   - Slot/shift occupancy breakdown (PieChart).
   - Fee collection status distribution (BarChart).

7. **AI Twist: Late Fee Defaulter Predictor (FastAPI Microservice)**:
   - Python FastAPI microservice (`ai-service/main.py`) that scans student historical payment delays, past dues, partial settlements, and tenure.
   - Generates next-month default risk score (High/Medium/Low), probability percentage, and recommended intervention actions.
8. **GitHub Copilot Chat**:
   - Authenticated admin/staff chat powered by the GitHub Copilot SDK.
   - The backend must run with a supported Node.js version and a GitHub Copilot CLI account signed in.
   - The chat has no access to live library records or local tools; user messages are sent to GitHub Copilot.
9. **Per-Slot Library Pricing**:
   - Library admins can configure monthly prices for each time slot and schedule rates to start in a selected month.
   - Public library listings and booking show the configured prices; selected partial slots are added together and Full Day uses its own rate.
   - Active student profiles and future monthly fee records use the rate schedule effective for the relevant month.

---

## 🚀 How to Run Locally

### Option 1: One-Click Launch (Recommended)
Open PowerShell in the project directory and run:
```powershell
.\start-seatledger.ps1
```
This automatically boots:
- **Client Frontend** → `http://localhost:5173`
- **Backend API** → `http://localhost:5000`
- **AI Microservice** → `http://localhost:8000`

The backend also serves the built web client at `http://localhost:5000/`. Its `start` and `dev` scripts build the client before starting the API.

---

### Option 2: Running Services Individually

Before starting the backend, sign in to GitHub Copilot from the same machine and account that runs Node:
```powershell
copilot login
```

The server installs and runs the Copilot CLI runtime through `@github/copilot-sdk`. The SDK requires Node.js `^20.19.0` or `>=22.12.0`. Optionally set `COPILOT_MODEL` in the server environment to select an available model.

### Razorpay online payments

Set these variables in `server/.env` using credentials from your Razorpay dashboard. Use test-mode credentials while developing:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

The key ID and secret are required for checkout; the webhook secret is required to accept Razorpay webhook events. Restart the backend after changing them. Online payments remain disabled when the key ID or secret is missing. In the Razorpay Dashboard, configure a webhook to `https://<your-api-domain>/api/payments/webhook` and subscribe to `payment.captured`, using the same webhook secret. For local webhook testing, use a public HTTPS tunnel to your API.

Each library can receive its students' full fee amount through its own Razorpay Route Linked Account. In the platform's Route account, create and activate one Linked Account per library with `reference_id` set to `seatledger_<library MongoDB ID>`. In **Payment Settings**, the library admin enters that Linked Account's `acc_...` ID. The server verifies its reference ID and activated status, then sends a one-time code by SMS to the mobile number registered with Razorpay before connecting the account. Razorpay requires a 24-hour cooling period after account creation before transfers can be initiated.

For Razorpay account OTP SMS, configure an MSG91 Flow SMS template approved for your account and set its template ID and auth key in `server/.env`:

```env
MSG91_AUTH_KEY=your_msg91_auth_key
MSG91_TEMPLATE_ID=your_approved_template_id
```

The template must include a `var1` placeholder for the six-digit OTP. Indian numbers require the MSG91/DLT-approved sender and template setup. Without MSG91 credentials, OTPs can be displayed only in local development; production requests fail explicitly.

Use test-mode platform keys while developing and create matching test Route accounts. Replace them with live platform keys and live Linked Account IDs only after Razorpay onboarding/KYC is complete. After a successful student payment, the order transfers the full fee amount to that library's Linked Account; Razorpay then settles according to the linked account's settlement schedule. Configure the webhook at `https://<your-api-domain>/api/payments/webhook` for `payment.captured`, using the webhook secret above. Razorpay processing fees and taxes are separate and follow your Route account's pricing/settlement terms. Students can pay only fee records linked to their own student account, and the server verifies payment signatures and amount before recording fees as paid.

### Email and mobile authentication

Sign-in accepts the registered email address or mobile number with the account password. New library admins and students must verify their email with a 6-digit code; password recovery sends a code to the account email address. Razorpay Linked Account verification sends its code by SMS to the Linked Account's registered mobile number through MSG91.

Configure SMTP in `server/.env` to send verification and password-reset codes. For Gmail, use an App Password (not your normal Gmail password):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM="SeatLedger <your-address@gmail.com>"
```

Restart the backend after editing the environment file. For local email-OTP testing without SMTP, set `AUTH_OTP_LOG=true` in `server/.env` and read the code from the backend terminal. Route-account OTPs can also show a development code locally when MSG91 is not configured. Do not enable development OTP logging in production; production email and SMS OTP requests fail unless SMTP and MSG91 are configured, respectively.

### Automatic fee reminders

The backend scans daily at 09:00 Asia/Kolkata and queues one reminder per unpaid fee, per enabled channel, on the library's configured number of days before its due date (3 days by default). It skips inactive students and paid fees. Configure `APP_BASE_URL` as the public frontend URL so payment links in reminders work for students:

```env
APP_BASE_URL=https://your-public-frontend-domain
```

Email reminders require the SMTP settings above. WhatsApp reminders use Meta WhatsApp Cloud API and require a Meta-approved message template:

```env
META_WHATSAPP_ACCESS_TOKEN=your_meta_access_token
META_WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
META_WHATSAPP_TEMPLATE_NAME=your_approved_template_name
META_WHATSAPP_TEMPLATE_LANGUAGE=en
META_GRAPH_API_VERSION=your_supported_graph_api_version
```

The approved template must have five body parameters, in this order: student name, library name, pending amount, due date, and payment URL. Keep provider credentials only in `server/.env`; never put them in the frontend or share them in chat. Redis enables durable BullMQ scheduling. If Redis is unavailable, the backend uses an in-process daily timer, which cannot run while the backend is stopped; the Reminders page shows the current scheduler and delivery-provider readiness.

For Meta error `131030` ("Recipient phone number not in allowed list"), add and verify the recipient's full phone number, including country code, under **Meta Developers → WhatsApp → API Setup** for the test sender. Test senders can message only allowlisted recipients. For live delivery, complete Meta's production setup and message only recipients who have opted in.

1. **Start AI Microservice**:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   python ai-service/main.py
   ```

2. **Start Backend Server**:
   ```powershell
   cd server
   npm run dev
   ```

3. **Start Frontend Client**:
   ```powershell
   cd client
   npm run dev
   ```

---

## 🔑 Demo Pilot Accounts (1-Click Login on UI)

These demo accounts are for local development only. Production startup does not seed demo users.

| Role | Library | Email | Password |
| :--- | :--- | :--- | :--- |
| **Admin** | Kashi Study Point (Varanasi) | `admin@kashistudy.in` | `password123` |
| **Admin** | Awadh Digital Library (Lucknow) | `admin@awadhlib.in` | `password123` |
| **Staff** | Kashi Study Point (Varanasi) | `staff@kashistudy.in` | `password123` |
| **Student** | Amit Tripathi (Seat A1) | `amit.tripathi@gmail.com` | `student123` |

---

## Deploying the MERN app (Netlify + Render)

The React client is deployed on Netlify and the Node API on Render. Connect this repository to Netlify and use the included `netlify.toml` to get its site origin. Enable automatic deploys from your production branch in Netlify. When creating the Render API service from `render.yaml`, set `CORS_ORIGINS` to that origin; Render deploys each new commit automatically. Then set the Netlify environment variable `VITE_API_URL` to `https://<your-render-api-domain>/api` and trigger a one-time Netlify deploy to apply it.

In Render, set `MONGODB_URI` to a persistent MongoDB deployment URI and `CORS_ORIGINS` to the exact Netlify site origin (without a trailing slash, e.g. `https://your-site.netlify.app`). Render generates `JWT_SECRET` for the API. Add optional integrations such as Razorpay, SMTP, MSG91, and Meta WhatsApp credentials as Render environment variables; never commit `.env` files or put server secrets in Netlify.

The API requires MongoDB to be reachable in production and will not start against an in-memory database. Demo accounts are seeded only outside production. Configure and verify the production database, payment provider webhooks, email/SMS delivery, and Copilot CLI authentication separately before enabling those features. The AI prediction route falls back to its built-in heuristic if the optional FastAPI service is not deployed.

## Existing Streamlit app

The original Python/Streamlit application remains available in `app.py`. To run it locally, install `requirements.txt` and start it with `python -m streamlit run app.py`. Configure `.streamlit/secrets.toml` from `.streamlit/secrets.toml.example`; never commit the real secrets file. Set a strong `SEATLEDGER_SESSION_SECRET` before deploying it, and replace the development admin credentials in `config.py` before real use.

## 📁 Project Architecture

```text
SeatLedger/
├── client/              # React 18 + Vite + Tailwind CSS + Recharts (Port 5173)
├── server/              # Node.js + Express + Mongoose + BullMQ + Razorpay (Port 5000)
├── ai-service/          # Python FastAPI Late Fee Predictor (Port 8000)
├── start-seatledger.ps1 # Automatic one-click launcher
└── README.md
```
