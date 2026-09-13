import re
from datetime import date

import pandas as pd
import streamlit as st

from auth import is_authenticated, render_user_header
from database import add_student, delete_student, get_fee, get_student, list_students, record_payment, set_fee_status, set_student_status, update_student

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()

render_user_header("Student Management")
st.markdown("<style>button[kind='primary'] { background:#198754 !important; border-color:#198754 !important; } button[kind='secondary'] { color:#b42318 !important; border-color:#d64545 !important; }</style>", unsafe_allow_html=True)
search = st.text_input("Search by name, seat number, or contact")
status_filter = st.selectbox("Status", ["All", "Active", "Inactive"])
with st.form("add_student"):
    st.subheader("Add student")
    name = st.text_input("Student name *")
    seat = st.text_input("Seat number *", placeholder="Example: A-12 or 25")
    st.caption("Seat number is necessary because each student uses a different seat.")

    contact = st.text_input("Contact number *")
    father = st.text_input("Father's name *")
    address = st.text_area("Address *")
    joined = st.date_input("Joining date", value=date.today())
    fee = st.number_input("Monthly fee (Rs) *", min_value=1.0, step=100.0)
    submitted = st.form_submit_button("Add student", type="primary")
if submitted:
    if not all(value.strip() for value in (name, seat, contact, father, address)):
        st.error("Complete all required fields.")
    elif not re.fullmatch(r"[0-9+() -]{7,15}", contact.strip()):
        st.error("Enter a valid contact number.")
    else:
        try:
            add_student({"student_name": name.strip(), "seat_no": seat.strip(), "contact_no": contact.strip(), "father_name": father.strip(), "address": address.strip(), "joining_date": joined.isoformat(), "monthly_fee": fee})
            st.success("Student added.")
        except Exception as error:
            st.error("That seat is already assigned to an active student." if "UNIQUE" in str(error) else "Could not save the student.")

rows = list_students(status_filter, search)
rows = sorted(rows, key=lambda row: (int(row["seat_no"]) if str(row["seat_no"]).isdigit() else 999999, str(row["seat_no"]).lower()))
st.subheader(f"Students found: {len(rows)}")
table = pd.DataFrame([{"SEAT NO / ID": row["seat_no"], "NAME": row["student_name"], "CONTACT": row["contact_no"], "FATHER NAME": row["father_name"], "MONTHLY FEE": f"Rs {float(row['monthly_fee']):,.2f}", "STATUS": row["status"]} for row in rows])
if not table.empty:
    st.dataframe(table.style.set_properties(**{"font-weight": "bold"}).set_table_styles([{"selector": "th", "props": [("font-weight", "bold"), ("text-transform", "uppercase")]}]), use_container_width=True, hide_index=True)
st.subheader("Monthly payment status")
status_month = st.date_input("Payment month", date.today().replace(day=1), format="YYYY-MM-DD")
status_students = [row for row in rows if (status_month.year, status_month.month) >= tuple(map(int, row["joining_date"].split("-")[:2]))]
for row in status_students:
    fee_record = get_fee(row["id"], status_month.month, status_month.year)
    paid = float(fee_record["amount_paid"]) if fee_record else 0.0
    balance = max(0.0, float(row["monthly_fee"]) - paid)
    status = fee_record["status"] if fee_record else "Due"
    columns = st.columns([3, 1.2, 1.2, 1.2, 1.2, 1.2])
    columns[0].write(f"**{row['student_name']}** · Seat {row['seat_no']}")
    columns[1].write(f"Due Rs {float(row['monthly_fee']):,.0f}")
    columns[2].write(f"Paid Rs {paid:,.0f}")
    columns[3].write(f"Balance Rs {balance:,.0f}")
    if columns[4].button("Paid", key=f"student_paid_{row['id']}", type="primary"):
        set_fee_status(row["id"], status_month.month, status_month.year, "Paid", date.today().isoformat())
        st.rerun()
    if columns[5].button("Unpaid", key=f"student_unpaid_{row['id']}"):
        set_fee_status(row["id"], status_month.month, status_month.year, "Due")
        st.rerun()
    st.caption(f"Current status: {status}")
if rows:
    selected_id = int(st.selectbox("Open student profile", [f"{row['id']} - {row['student_name']}" for row in rows]).split(" - ")[0])
    student = get_student(selected_id)
    st.subheader(f"Edit student: {student['student_name']}")
    with st.form("edit_student"):
        st.text_input("Seat number / Student ID", value=str(student["seat_no"]), disabled=True)
        edited = {"student_name": st.text_input("Name", value=student["student_name"]), "seat_no": st.text_input("Seat number", value=student["seat_no"]), "contact_no": st.text_input("Contact", value=student["contact_no"]), "father_name": st.text_input("Father's name", value=student["father_name"]), "address": st.text_area("Address", value=student["address"]), "joining_date": st.date_input("Joining date", value=date.fromisoformat(student["joining_date"])), "monthly_fee": st.number_input("Monthly fee", min_value=1.0, value=float(student["monthly_fee"])), "status": student["status"]}
        if st.form_submit_button("Save changes", type="primary"):
            update_student(selected_id, edited)
            st.success("Student updated.")
            st.rerun()
    if st.button("Deactivate student" if student["status"] == "Active" else "Reactivate student"):
        try:
            set_student_status(selected_id, "Inactive" if student["status"] == "Active" else "Active")
            st.rerun()
        except Exception:
            st.error("That seat is already assigned to another active student.")
    st.divider()
    confirm_delete = st.checkbox("I understand this permanently deletes the student and all fee history.", key=f"confirm_delete_{selected_id}")
    if st.button("Delete student permanently", key=f"delete_{selected_id}", disabled=not confirm_delete):
        delete_student(selected_id)
        st.success("Student and all linked fee history were permanently deleted.")
        st.rerun()
