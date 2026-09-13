from datetime import date
from shutil import copy2

from config import BACKUPS_DIR, DATABASE_PATH


def backup_database() -> str:
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    destination = BACKUPS_DIR / f"seatledger_backup_{date.today():%Y_%m_%d}.db"
    counter = 1
    while destination.exists():
        destination = BACKUPS_DIR / f"seatledger_backup_{date.today():%Y_%m_%d}_{counter}.db"
        counter += 1
    copy2(DATABASE_PATH, destination)
    return str(destination)
