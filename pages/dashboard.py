import streamlit as st

from auth import is_authenticated, render_user_header
from database import count_students, total_collected

if not is_authenticated():
    st.warning("Please sign in from the main app.")
    st.stop()

render_user_header("Dashboard")
first, second, third = st.columns(3)
first.metric("Total students", count_students("All"))
second.metric("Active students", count_students("Active"))
third.metric("Total collected", f"Rs {total_collected():,.2f}")
