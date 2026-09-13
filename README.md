# SeatLedger

**SeatLedger** is a professional Streamlit application for library administrators to manage students, seats, monthly fees, dues, reports, and backups.

## Features

- Secure sign in and registration with Werkzeug password hashing
- Separate student and fee data for each registered library user
- Manual seat assignment with duplicate-seat protection
- Student search, editing, deactivation, and permanent deletion
- Monthly fee collection with Paid, Unpaid, Partial, and Due statuses
- Joining-date-aware fee history and yearly summaries
- Dashboard metrics, collection trends, and Excel reports
- SQLite database storage and dated database backups
- Optional Google OIDC sign in

## Run locally

```powershell
cd "C:\Users\AJIT KUMAR YADAV\OneDrive\Desktop\SeatLedger"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m streamlit run app.py --server.fileWatcherType polling
```

Open `http://localhost:8501` in your browser.

## Local account

The first local admin is created with the development credentials in `config.py`:

```text
Username: admin
Password: admin123
```

Change these values before using the application with real data. Passwords are stored as hashes, never as plain text.

## Google login

Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml`, add Google OAuth credentials, and configure the authorized redirect URI. Never commit `secrets.toml`.

## Project structure

```text
app.py                 Main Streamlit entrypoint
auth.py                Authentication and session management
database.py            SQLite schema and queries
config.py              Application settings
pages/                 Dashboard, students, fees, history, reports, settings
utils/                 Calculations, exports, and backups
database/              Local SQLite database files
backups/               Database backups
```

## License

This project is intended for local library administration and portfolio use.
