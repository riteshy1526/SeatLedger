import streamlit as st
from auth import ensure_admin
from database import get_admin_payment, upsert_admin_payment

# ----------------------------------------------------------------------
#   Admin → Payment Settings
# ----------------------------------------------------------------------
st.set_page_config(page_title="Admin – Payment Settings", layout="wide")

# Keep the admin‑only guard (same as other admin pages)
ensure_admin()

st.title("💰 Admin Payment Settings")
st.caption(
    "Enter UPI or bank details for manual payments. "
    "Razorpay checkout uses credentials configured in the backend environment."
)

# Load existing record (if any)
payment = get_admin_payment()
default_upi = payment["upi_id"] if payment else ""
default_bank = payment["bank_name"] if payment else ""
default_acct = payment["account_number"] if payment else ""
default_ifsc = payment["ifsc_code"] if payment else ""

with st.form("payment_form"):
    st.subheader("Payment details")
    upi_id = st.text_input("UPI ID (e.g. abc@upi)", value=default_upi)
    bank_name = st.text_input("Bank Name", value=default_bank)
    account_number = st.text_input("Account Number", value=default_acct)
    ifsc_code = st.text_input("IFSC Code", value=default_ifsc)

    submitted = st.form_submit_button("💾 Save")

if submitted:
    upsert_admin_payment(upi_id, bank_name, account_number, ifsc_code)
    st.success("✅ Payment details saved.")