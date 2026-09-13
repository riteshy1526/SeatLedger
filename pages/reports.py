from datetime import date
import pandas as pd
import streamlit as st
from auth import is_authenticated, render_user_header
from database import fee_rows, list_students, period_totals
from utils.export import dataframe_to_excel

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()
render_user_header("Reports & Exports")
year = st.number_input("Year", min_value=2000, max_value=2100, value=date.today().year, step=1)
month = st.selectbox("Month", ["All"] + list(range(1, 13)), format_func=lambda value: "All months" if value == "All" else date(2000, value, 1).strftime("%B"))
status = st.selectbox("Status", ["All", "Paid", "Partial", "Due"])
students = list_students()
student_options = {"All students": None} | {f"{row['student_name']} · Seat {row['seat_no']}": row for row in students}
selected_student = st.selectbox("Student", list(student_options))
student = student_options[selected_student]
month_value = None if month == "All" else month
rows = [dict(row) for row in fee_rows(year, month_value, student["id"] if student else None, status)]
report = pd.DataFrame(rows)
due, paid = period_totals(year, month_value)
a, b, c = st.columns(3)
a.metric("Total due", f"Rs {due:,.2f}")
b.metric("Total collection", f"Rs {paid:,.2f}")
c.metric("Pending", f"Rs {max(0, due - paid):,.2f}")
st.dataframe(report, use_container_width=True, hide_index=True)
if not report.empty:
    st.download_button("Export to Excel", dataframe_to_excel(report), f"seatledger_report_{year}.xlsx", use_container_width=True)