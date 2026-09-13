import streamlit as st
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from config import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME
from database import get_connection
from config import SESSION_SECRET

SESSION_MAX_AGE = 60 * 60 * 24 * 30


def _session_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(SESSION_SECRET, salt="seatledger-auth")


def restore_session() -> None:
    token = st.query_params.get("session")
    if token and not is_authenticated():
        try:
            username = _session_serializer().loads(token, max_age=SESSION_MAX_AGE)
            _start_session(username, update_url=False)
        except (BadSignature, SignatureExpired):
            st.query_params.pop("session", None)


def _start_session(username: str, update_url: bool = True) -> None:
    st.session_state.authenticated = True
    st.session_state.username = username
    with get_connection(shared=True) as connection:
        admin = connection.execute("SELECT library_name FROM admins WHERE username = ?", (username,)).fetchone()
    st.session_state.library_name = admin["library_name"] if admin else "My Library"
    if update_url:
        st.query_params["session"] = _session_serializer().dumps(username)


def ensure_admin() -> None:
    with get_connection(shared=True) as connection:
        if connection.execute("SELECT 1 FROM admins LIMIT 1").fetchone() is None:
            connection.execute("INSERT INTO admins (username, password_hash) VALUES (?, ?)", (DEFAULT_ADMIN_USERNAME, generate_password_hash(DEFAULT_ADMIN_PASSWORD)))


def register_user(full_name: str, email: str, library_name: str, password: str) -> tuple[bool, str]:
    full_name = full_name.strip()
    email = email.strip().lower()
    library_name = library_name.strip()
    if not full_name or not library_name or "@" not in email or len(password) < 8:
        return False, "Enter your name, library name, valid email, and a password with 8+ characters."
    username = email
    try:
        with get_connection(shared=True) as connection:
            connection.execute("INSERT INTO admins (full_name, library_name, username, email, password_hash) VALUES (?, ?, ?, ?, ?)", (full_name, library_name, username, email, generate_password_hash(password)))
    except Exception as error:
        if "UNIQUE" in str(error):
            return False, "That username is already registered."
        return False, "Registration could not be completed."
    return True, "Account registered. You can now sign in."


def update_library_name(library_name: str) -> tuple[bool, str]:
    library_name = library_name.strip()
    username = st.session_state.get("username", "")
    if not library_name:
        return False, "Library name cannot be empty."
    if not username:
        return False, "Please sign in again before changing the library name."
    with get_connection(shared=True) as connection:
        connection.execute("UPDATE admins SET library_name = ? WHERE username = ?", (library_name, username))
    st.session_state.library_name = library_name
    return True, "Library name updated successfully."


def is_authenticated() -> bool:
    return bool(st.session_state.get("authenticated"))


def login_form() -> None:
    mode = st.radio("What do you want to do?", ["Sign in", "Register"], horizontal=True)
    if mode == "Sign in":
        st.subheader("Sign in to SeatLedger")
        with st.form("login_form"):
            username = st.text_input("Email or username", placeholder="Enter your email", key="signin_username")
            password = st.text_input("Password", type="password", placeholder="Enter your password", key="signin_password")
            submitted = st.form_submit_button("Sign in", type="primary", use_container_width=True)
        if submitted:
            with get_connection(shared=True) as connection:
                admin = connection.execute("SELECT * FROM admins WHERE username = ?", (username.strip().lower(),)).fetchone()
            if admin and check_password_hash(admin["password_hash"], password):
                _start_session(username.strip().lower())
                st.rerun()
            st.error("Invalid username or password.")
    else:
        st.subheader("Create your SeatLedger account")
        with st.form("register_form"):
            full_name = st.text_input("Enter your name", placeholder="Your full name", key="signup_name")
            library_name = st.text_input("Library name", placeholder="Your library name", key="signup_library")
            email = st.text_input("Fill your email", placeholder="you@example.com", key="signup_email")
            new_password = st.text_input("Create password", type="password", placeholder="Minimum 8 characters", key="signup_password")
            confirm_password = st.text_input("Confirm password", type="password", placeholder="Type the same password again")
            registered = st.form_submit_button("Create account", use_container_width=True)
        if registered:
            if new_password != confirm_password:
                st.error("Passwords do not match.")
            else:
                success, message = register_user(full_name, email, library_name, new_password)
                (st.success if success else st.error)(message)

    st.divider()
    if st.button("Continue with Google", use_container_width=True):
        try:
            st.login("google")
        except Exception:
            st.warning("Google login is not configured yet. Add an OIDC provider named 'google' in .streamlit/secrets.toml.")


def logout() -> None:
    st.session_state.clear()
    st.query_params.pop("session", None)
    st.rerun()


def render_user_header(section_title: str) -> None:
    library_name = st.session_state.get("library_name", "My Library")
    st.markdown(f"<div class='library-header'><div class='library-name'>{library_name}</div><div class='section-name'>{section_title}</div></div>", unsafe_allow_html=True)
    st.markdown("""
    <style>
    :root { --sl-text:#e8f1f5; --sl-muted:#b9cbd5; --sl-accent:#6fc1dd; --sl-border:#34586b; }
    .library-header { border-bottom:2px solid var(--sl-border); padding:0 0 .8rem; margin-bottom:1.4rem; }
    .library-name { font-family:Georgia,serif; font-size:2rem; font-weight:700; color:var(--sl-accent)!important; letter-spacing:.02em; }
    .section-name { font-size:1.05rem; font-weight:700; color:var(--sl-muted)!important; margin-top:.2rem; }
    label, p, span, [data-testid="stMetricLabel"], [data-testid="stMetricValue"] { color:var(--sl-text); }
    [data-testid="stCaptionContainer"] p { color:var(--sl-muted)!important; }
    [data-testid="stToolbar"], [data-testid="stToolbar"] button, #MainMenu, header button { color:var(--sl-text)!important; fill:var(--sl-text)!important; }
    </style>
    """, unsafe_allow_html=True)