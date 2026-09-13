import streamlit as st

from auth import is_authenticated, render_user_header, update_library_name
from config import BACKUPS_DIR
from database import init_db
from utils.backup import backup_database

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()

render_user_header("Settings")
st.subheader("Library profile")
with st.form("library_name_form"):
    new_library_name = st.text_input("Library name", value=st.session_state.get("library_name", "My Library"), placeholder="Enter your library name")
    change_name = st.form_submit_button("Update library name", type="primary")
if change_name:
    success, message = update_library_name(new_library_name)
    (st.success if success else st.error)(message)
    if success:
        st.rerun()

st.divider()
st.subheader("Database")
st.write(f"Backups are stored in `{BACKUPS_DIR}`.")
if st.button("Create database backup", type="primary"):
    init_db()
    st.success(f"Backup created: {backup_database()}")
