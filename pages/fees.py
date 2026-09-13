from datetime import date
import streamlit as st
from auth import is_authenticated, render_user_header
from database import fee_rows, list_students, period_totals, record_payment

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()
render_user_header("Monthly Fee Collection")
st.markdown("<style>button[kind='primary'] { background:#198754 !important; border-color:#198754 !important; } button[kind='secondary'] { color:#b42318 !important; border-color:#d64545 !important; }</style>", unsafe_allow_html=True)
period = st.date_input("Select month", date.today().replace(day=1), format="YYYY-MM-DD")
students = [row for row in list_students("Active") if (period.year, period.month) >= tuple(map(int, row["joining_date"].split("-")[:2]))]
if students:
    choices = {f"{row['student_name']} · Seat {row['seat_no']}": row for row in students}
    with st.form("payment"):
        label = st.selectbox("Student", list(choices))
        amount = st.number_input("Amount paid (Rs)", min_value=0.0, step=100.0)
        paid_on = st.date_input("Payment date", date.today())
        save = st.form_submit_button("Record payment", type="primary")
    if save:
        if amount <= 0:
            st.error("Payment must be greater than zero.")
        else:
            try:
                record_payment(choices[label]["id"], period.month, period.year, amount, paid_on.isoformat())
                st.success("Payment recorded and balance recalculated.")
                st.rerun()
            except Exception as error:
                st.error(str(error))
else:
    st.info("Add an active student before recording fees.")
due, paid = period_totals(period.year, period.month)
left, right = st.columns(2)
left.metric("Total due", f"Rs {due:,.2f}")
right.metric("Total paid", f"Rs {paid:,.2f}")
st.info("Payment status buttons are available in the Students section. Use this page to enter a custom amount for one student and one month.")
