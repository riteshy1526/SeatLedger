from datetime import date

import pandas as pd
import streamlit as st

from auth import _start_session, ensure_admin, is_authenticated, login_form, logout, render_user_header, restore_session
from config import APP_TITLE, TOTAL_SEATS
from database import count_students, init_db, monthly_collections, period_totals, total_collected, total_seats

st.set_page_config(page_title=APP_TITLE, page_icon="S", layout="wide")
init_db(shared=True)
ensure_admin()
restore_session()

try:
    if st.user.is_logged_in:
        _start_session(st.user.get("email", "google-user"), update_url=False)
except Exception:
    pass
init_db()

st.title(APP_TITLE)
st.caption("Student Library & Fee Management System")

if not is_authenticated():
    st.markdown("""
    <style>
    [data-testid="stSidebar"] { display: none; }
    .block-container { max-width: 560px; padding-top: 8vh; }
    [data-testid="stForm"] { border: 1px solid #28495d; border-radius: 14px; padding: 1.25rem; background: #102636; }
    :root { --text-color: #e8f1f5; --muted-color: #b9cbd5; --border-color: #28495d; --form-bg: #102636; --input-bg: #132d3d; }
    h1, h2, h3, p, label, [data-testid="stMarkdownContainer"] { color: var(--text-color) !important; }
    [data-testid="stCaptionContainer"] p { color: var(--muted-color) !important; }
    [data-baseweb="input"], [data-baseweb="textarea"] { background: var(--input-bg) !important; }
    [data-baseweb="input"] input, [data-baseweb="textarea"] textarea { color: var(--text-color) !important; -webkit-text-fill-color: var(--text-color) !important; }
    [data-baseweb="input"] input::placeholder, [data-baseweb="textarea"] textarea::placeholder { color: var(--muted-color) !important; opacity: 1; }
    [data-testid="stToolbar"], [data-testid="stToolbar"] button, #MainMenu, header button { color: #e8f1f5 !important; fill: #e8f1f5 !important; }
    </style>
    """, unsafe_allow_html=True)
    st.markdown("### Your quiet place to manage every seat and payment")
    st.write("Securely manage students, seats, monthly fees, dues, and reports from one focused workspace.")
    login_form()
    st.stop()

with st.sidebar:
    st.header("SeatLedger")
    st.write("Admin workspace")
    if st.button("Refresh dashboard", use_container_width=True):
        st.rerun()
    if st.button("Sign out", use_container_width=True):
        logout()

render_user_header("Dashboard")
st.markdown("<style>.stApp,[data-testid='stAppViewContainer']{background:#071521!important;color:#e8f1f5!important} [data-testid='stSidebar']{background:#0b1d2a!important} [data-testid='stMetricLabel'],[data-testid='stMetricValue'],[data-testid='stToolbar'],#MainMenu,header button{color:#e8f1f5!important;fill:#e8f1f5!important} [data-testid='stDataFrame']{border:1px solid #28495d}</style>", unsafe_allow_html=True)
current = date.today()
month_due, month_paid = period_totals(current.year, current.month)
metrics = [
    ("Total students", count_students("All")), ("Active students", count_students()),
    ("Total seats", TOTAL_SEATS), ("Occupied seats", total_seats()),
    ("Available seats", max(0, TOTAL_SEATS - total_seats())),
    ("Current collection", f"Rs {month_paid:,.2f}"), ("Current due", f"Rs {max(0, month_due - month_paid):,.2f}"),
    ("Total collection", f"Rs {total_collected():,.2f}"),
]
for start in range(0, len(metrics), 4):
    columns = st.columns(4)
    for column, (label, value) in zip(columns, metrics[start:start + 4]):
        column.metric(label, value)

trend = pd.DataFrame(monthly_collections(current.year), columns=["month", "collected", "due"])
st.subheader(f"Collection trend · {current.year}")
month_index = pd.DataFrame({"month": range(1, 13)})
trend = month_index.merge(trend, on="month", how="left").fillna(0)
trend = trend.set_index("month")[["collected", "due"]]
trend.index.name = "Month number (Jan=1, Dec=12)"
st.line_chart(trend)
st.caption("Month order: 1 Jan · 2 Feb · 3 Mar · 4 Apr · 5 May · 6 Jun · 7 Jul · 8 Aug · 9 Sep · 10 Oct · 11 Nov · 12 Dec")
st.caption("Graph updates automatically after student or payment changes. Use Refresh dashboard to reload the latest SQLite data.")
st.success("Use the sidebar to manage students, collect fees, view history, and export reports.")
