# SeatLedger

**SeatLedger** is a Streamlit application for library administrators to manage students, seats, monthly fees, dues, reports, and backups.

**Live demo:** https://seatledger.streamlit.app

## Features

- Sign in and registration (Supabase Auth) with Werkzeug password hashing
- Signed, expiring session tokens so users stay logged in across refreshes
- Separate student and fee data for each registered library user (one SQLite database per user)
- Manual seat assignment with duplicate-seat protection (100 seats by default, set in `config.py`)
- Student search, editing, deactivation, and permanent deletion
- Monthly fee collection with Paid, Unpaid, Partial, and Due statuses
- Joining-date-aware fee history and yearly summaries
- Dashboard metrics and collection trends
- Excel reports and dated database backups
- Optional Google OIDC sign in

## Tech Stack

Python, Streamlit, SQLite, Pandas, openpyxl, Supabase Auth, Werkzeug

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

Open `http://localhost:8501` in your browser.

## Configuration

**Secrets.** Create `.streamlit/secrets.toml` (never commit it). Start from `.streamlit/secrets.toml.example`:

```toml
[supabase]
url = "your-supabase-project-url"
key = "your-supabase-anon-key"

# Optional: Google sign in
[google]
client_id = "your-google-client-id"
client_secret = "your-google-client-secret"
server_metadata_url = "https://accounts.google.com/.well-known/openid-configuration"
```

For Google sign in, also register the redirect URI that Streamlit shows for your app.

**Session secret.** Set the `SEATLEDGER_SESSION_SECRET` environment variable to a long random value before deploying.

**Default admin.** A development admin account is created from the values in `config.py`. Change them before using the app with real data.

## Project structure

```text
app.py                 Main Streamlit entrypoint and dashboard
auth.py                Authentication and session management
database.py            SQLite schema and queries (per-user database files)
config.py              Application settings
pages/                 Dashboard, students, fees, fee history, reports, settings
utils/                 Calculations, Excel export, and backups
database/              Local SQLite database files (created at runtime)
backups/               Database backups (created at runtime)
```

## License

This project is intended for local library administration and portfolio use.
