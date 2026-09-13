from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"
DATABASE_PATH = DATABASE_DIR / "seatledger.db"
BACKUPS_DIR = BASE_DIR / "backups"
ASSETS_DIR = BASE_DIR / "assets"
APP_TITLE = "SeatLedger"
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"
TOTAL_SEATS = 100
SESSION_SECRET = os.environ.get("SEATLEDGER_SESSION_SECRET", "seatledger-local-session-secret")
