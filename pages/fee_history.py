from datetime import date
import pandas as pd
import streamlit as st
from auth import is_authenticated, render_user_header
from database import list_students, student_fee_history

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()
render_user_header("Yearly Fee History")
students = list_students()
if students:
    student_options = {f"{row['student_name']} · Seat {row['seat_no']}": row for row in students}
    selected_label = st.selectbox("Student", list(student_options))
    student = student_options[selected_label]
    year = st.number_input("Year", min_value=2000, max_value=2100, value=date.today().year, step=1)
    history = pd.DataFrame(student_fee_history(student["id"], year))
    st.subheader(f"{student['student_name']} · Seat {student['seat_no']}")
    st.caption(f"Monthly fee: Rs {float(student['monthly_fee']):,.2f} · Status: {student['status']}")
    st.dataframe(history, use_container_width=True, hide_index=True)
    a, b, c = st.columns(3)
    a.metric("Annual due", f"Rs {history['Amount Due'].sum():,.2f}")
    b.metric("Annual paid", f"Rs {history['Amount Paid'].sum():,.2f}")
    c.metric("Annual pending", f"Rs {history['Balance'].sum():,.2f}")
else:
    st.info("No students found.")