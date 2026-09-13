import sqlite3
import hashlib
from contextlib import contextmanager
from datetime import date
from typing import Iterator

from config import DATABASE_DIR, DATABASE_PATH
from config import DEFAULT_ADMIN_USERNAME


def _database_path(shared: bool = False, username: str = ""):
    if not shared:
        if not username:
            try:
                import streamlit as st
                username = st.session_state.get("username", "")
            except Exception:
                username = ""
        if username and username != DEFAULT_ADMIN_USERNAME:
            user_key = hashlib.sha256(username.encode("utf-8")).hexdigest()[:20]
            user_dir = DATABASE_DIR / "users"
            user_dir.mkdir(parents=True, exist_ok=True)
            return user_dir / f"{user_key}.db"
    return DATABASE_PATH


@contextmanager
def get_connection(shared: bool = False) -> Iterator[sqlite3.Connection]:
    path = _database_path(shared)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db(shared: bool = False) -> None:
    with get_connection(shared=shared) as connection:
        admin_columns = {row["name"] for row in connection.execute("PRAGMA table_info(admins)").fetchall()}
        if admin_columns and "email" not in admin_columns:
            connection.execute("ALTER TABLE admins ADD COLUMN full_name TEXT NOT NULL DEFAULT 'Administrator'")
            connection.execute("ALTER TABLE admins ADD COLUMN email TEXT NOT NULL DEFAULT ''")
        if admin_columns and "library_name" not in admin_columns:
            connection.execute("ALTER TABLE admins ADD COLUMN library_name TEXT NOT NULL DEFAULT 'My Library'")
        existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(students)").fetchall()}
        if existing_columns and "student_name" not in existing_columns:
            connection.execute("ALTER TABLE students RENAME TO students_legacy")
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'payments'").fetchone():
            connection.execute("ALTER TABLE payments RENAME TO payments_legacy")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL DEFAULT 'Administrator', library_name TEXT NOT NULL DEFAULT 'My Library', username TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT NOT NULL, seat_no TEXT NOT NULL, contact_no TEXT NOT NULL, father_name TEXT NOT NULL, address TEXT NOT NULL, joining_date TEXT NOT NULL, monthly_fee REAL NOT NULL CHECK(monthly_fee > 0), status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_active_seat ON students(seat_no) WHERE status = 'Active';
            CREATE INDEX IF NOT EXISTS idx_student_status ON students(status);
            CREATE TABLE IF NOT EXISTS fees (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12), year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100), amount_due REAL NOT NULL, amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0), balance REAL NOT NULL, payment_date TEXT, status TEXT NOT NULL CHECK(status IN ('Paid', 'Partial', 'Due')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id, month, year), FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE);
            CREATE INDEX IF NOT EXISTS idx_fees_period ON fees(year, month);
        """)


def count_students(status: str = "Active") -> int:
    with get_connection() as connection:
        if status == "All":
            return int(connection.execute("SELECT COUNT(*) FROM students").fetchone()[0])
        return int(connection.execute("SELECT COUNT(*) FROM students WHERE status = ?", (status,)).fetchone()[0])


def total_seats() -> int:
    with get_connection() as connection:
        return int(connection.execute("SELECT COUNT(DISTINCT seat_no) FROM students").fetchone()[0])


def list_students(status: str = "All", search: str = "") -> list[sqlite3.Row]:
    query = "SELECT * FROM students WHERE 1 = 1"
    parameters: list[str] = []
    if status != "All":
        query += " AND status = ?"
        parameters.append(status)
    if search.strip():
        query += " AND (student_name LIKE ? OR seat_no LIKE ? OR contact_no LIKE ?)"
        term = f"%{search.strip()}%"
        parameters.extend([term, term, term])
    with get_connection() as connection:
        return connection.execute(query + " ORDER BY student_name", parameters).fetchall()


def get_student(student_id: int) -> sqlite3.Row | None:
    with get_connection() as connection:
        return connection.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()


def add_student(student: dict[str, object]) -> None:
    fields = ("student_name", "seat_no", "contact_no", "father_name", "address", "joining_date", "monthly_fee")
    with get_connection() as connection:
        values = tuple(student[field] for field in fields)
        connection.execute(f"INSERT INTO students ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})", values)


def update_student(student_id: int, student: dict[str, object]) -> None:
    fields = ("student_name", "seat_no", "contact_no", "father_name", "address", "joining_date", "monthly_fee", "status")
    with get_connection() as connection:
        connection.execute(f"UPDATE students SET {', '.join(f'{field} = ?' for field in fields)} WHERE id = ?", tuple(student[field] for field in fields) + (student_id,))


def set_student_status(student_id: int, status: str) -> None:
    with get_connection() as connection:
        connection.execute("UPDATE students SET status = ? WHERE id = ?", (status, student_id))


def delete_student(student_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM students WHERE id = ?", (student_id,))


def get_fee(student_id: int, month: int, year: int) -> sqlite3.Row | None:
    with get_connection() as connection:
        return connection.execute("SELECT * FROM fees WHERE student_id = ? AND month = ? AND year = ?", (student_id, month, year)).fetchone()


def record_payment(student_id: int, month: int, year: int, amount: float, payment_date: str) -> None:
    student = get_student(student_id)
    if student is None:
        raise ValueError("Student was not found.")
    existing = get_fee(student_id, month, year)
    paid = float(existing["amount_paid"]) + amount if existing else amount
    due = float(student["monthly_fee"])
    balance = max(0.0, due - paid)
    status = "Paid" if balance == 0 else "Partial" if paid > 0 else "Due"
    with get_connection() as connection:
        if existing:
            connection.execute("UPDATE fees SET amount_paid = ?, balance = ?, payment_date = ?, status = ? WHERE id = ?", (paid, balance, payment_date, status, existing["id"]))
        else:
            connection.execute("INSERT INTO fees (student_id, month, year, amount_due, amount_paid, balance, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (student_id, month, year, due, paid, balance, payment_date, status))


def set_fee_status(student_id: int, month: int, year: int, status: str, payment_date: str | None = None) -> None:
    student = get_student(student_id)
    if student is None:
        raise ValueError("Student was not found.")
    if status not in ("Paid", "Due"):
        raise ValueError("Invalid fee status.")
    amount_paid = float(student["monthly_fee"]) if status == "Paid" else 0.0
    balance = 0.0 if status == "Paid" else float(student["monthly_fee"])
    with get_connection() as connection:
        existing = connection.execute("SELECT id FROM fees WHERE student_id = ? AND month = ? AND year = ?", (student_id, month, year)).fetchone()
        if existing:
            connection.execute("UPDATE fees SET amount_paid = ?, balance = ?, payment_date = ?, status = ? WHERE id = ?", (amount_paid, balance, payment_date, status, existing["id"]))
        else:
            connection.execute("INSERT INTO fees (student_id, month, year, amount_due, amount_paid, balance, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (student_id, month, year, float(student["monthly_fee"]), amount_paid, balance, payment_date, status))


def fee_rows(year: int, month: int | None = None, student_id: int | None = None, status: str = "All") -> list[sqlite3.Row]:
    query = "SELECT fees.*, students.student_name, students.seat_no, students.contact_no FROM fees JOIN students ON students.id = fees.student_id WHERE fees.year = ? AND (fees.year > CAST(strftime('%Y', students.joining_date) AS INTEGER) OR (fees.year = CAST(strftime('%Y', students.joining_date) AS INTEGER) AND fees.month >= CAST(strftime('%m', students.joining_date) AS INTEGER)))"
    parameters: list[object] = [year]
    for condition, value in (("fees.month = ?", month), ("fees.student_id = ?", student_id), ("fees.status = ?", status if status != "All" else None)):
        if value is not None:
            query += f" AND {condition}"
            parameters.append(value)
    with get_connection() as connection:
        return connection.execute(query + " ORDER BY fees.month, students.student_name", parameters).fetchall()


def student_fee_history(student_id: int, year: int) -> list[dict[str, object]]:
    student = get_student(student_id)
    rows = {row["month"]: row for row in fee_rows(year, student_id=student_id)}
    joining_date = date.fromisoformat(student["joining_date"]) if student else date.max
    history = []
    for month in range(1, 13):
        if (year, month) < (joining_date.year, joining_date.month):
            continue
        row = rows.get(month)
        due = float(student["monthly_fee"]) if student else 0
        paid = float(row["amount_paid"]) if row else 0
        history.append({"Month": date(2000, month, 1).strftime("%B"), "Year": year, "Amount Due": due, "Amount Paid": paid, "Balance": max(0, due - paid), "Payment Date": row["payment_date"] if row else "", "Status": row["status"] if row else "Due"})
    return history


def period_totals(year: int, month: int | None = None) -> tuple[float, float]:
    students = list_students("Active")
    due = paid = 0.0
    months = [month] if month else range(1, 13)
    for student in students:
        joining = date.fromisoformat(student["joining_date"])
        for current_month in months:
            if (year, current_month) < (joining.year, joining.month):
                continue
            due += float(student["monthly_fee"])
            fee = get_fee(student["id"], current_month, year)
            if fee:
                paid += float(fee["amount_paid"])
    return due, paid


def monthly_collections(year: int) -> list[dict[str, object]]:
    with get_connection() as connection:
        return [dict(row) for row in connection.execute("SELECT month, SUM(amount_paid) AS collected, SUM(balance) AS due FROM fees WHERE year = ? GROUP BY month ORDER BY month", (year,)).fetchall()]


def total_collected() -> float:
    with get_connection() as connection:
        return float(connection.execute("SELECT COALESCE(SUM(amount_paid), 0) FROM fees").fetchone()[0])