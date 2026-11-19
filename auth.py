import re
import streamlit as st
from supabase import create_client, Client
from itsdangerous import (
    BadSignature,
    SignatureExpired,
    URLSafeTimedSerializer,
)
from werkzeug.security import generate_password_hash, check_password_hash

from config import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, SESSION_SECRET
from database import get_connection
from utils.otp_service import generate_otp, send_email_otp, send_mobile_otp

SESSION_MAX_AGE = 60 * 60 * 24 * 30


# =========================================================
# SUPABASE
# =========================================================

@st.cache_resource
def get_supabase() -> Client:
    return create_client(
        st.secrets["supabase"]["url"],
        st.secrets["supabase"]["key"],
    )


# =========================================================
# SESSION
# =========================================================

def _session_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        SESSION_SECRET,
        salt="seatledger-auth",
    )


def restore_session() -> None:
    token = st.query_params.get("session")

    if token and not is_authenticated():
        try:
            username = _session_serializer().loads(
                token,
                max_age=SESSION_MAX_AGE,
            )

            _start_session(
                username,
                update_url=False,
            )

        except (BadSignature, SignatureExpired):
            st.query_params.pop("session", None)


def _start_session(
    username: str,
    library_name: str = "My Library",
    update_url: bool = True,
) -> None:
    st.session_state.authenticated = True
    st.session_state.username = username
    st.session_state.library_name = library_name

    try:
        with get_connection(shared=True) as connection:
            admin = connection.execute(
                """
                SELECT library_name
                FROM admins
                WHERE username = ?
                """,
                (username,),
            ).fetchone()

            if admin and admin["library_name"]:
                st.session_state.library_name = admin["library_name"]

    except Exception:
        pass

    if update_url:
        st.query_params["session"] = (
            _session_serializer().dumps(username)
        )


# =========================================================
# DEFAULT ADMIN
# =========================================================

def ensure_admin() -> None:
    try:
        with get_connection(shared=True) as connection:
            existing = connection.execute(
                "SELECT 1 FROM admins LIMIT 1"
            ).fetchone()

            if existing is None:
                connection.execute(
                    """
                    INSERT INTO admins
                    (username, password_hash)
                    VALUES (?, ?)
                    """,
                    (
                        DEFAULT_ADMIN_USERNAME,
                        generate_password_hash(
                            DEFAULT_ADMIN_PASSWORD
                        ),
                    ),
                )

    except Exception:
        pass


# =========================================================
# REGISTER USER
# =========================================================

def register_user(
    full_name: str,
    email: str,
    mobile: str,
    library_name: str,
    password: str,
) -> tuple[bool, str]:

    full_name = full_name.strip()
    email = email.strip().lower()
    mobile = mobile.strip()
    library_name = library_name.strip()

    if not full_name:
        return False, "Please enter your name."

    if not library_name:
        return False, "Please enter your library name."

    if "@" not in email or "." not in email:
        return False, "Please enter a valid email."

    clean_mobile = re.sub(r"[^\d+]", "", mobile)
    if len(clean_mobile) < 10:
        return False, "Please enter a valid 10-digit mobile number."

    if len(password) < 8:
        return False, "Password must contain at least 8 characters."

    # First attempt saving in local SQLite
    try:
        with get_connection(shared=True) as connection:
            existing = connection.execute(
                "SELECT id FROM admins WHERE username = ? OR email = ?",
                (email, email),
            ).fetchone()
            if existing:
                return False, "This email is already registered."

            connection.execute(
                """
                INSERT INTO admins
                (
                    full_name,
                    library_name,
                    username,
                    email,
                    mobile,
                    password_hash
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    full_name,
                    library_name,
                    email,
                    email,
                    clean_mobile,
                    generate_password_hash(password),
                ),
            )
    except Exception as db_err:
        return False, f"Database error: {db_err}"

    # Sync with Supabase (if available)
    try:
        supabase = get_supabase()
        supabase.auth.sign_up(
            {
                "email": email,
                "password": password,
                "options": {
                    "data": {
                        "full_name": full_name,
                        "library_name": library_name,
                        "mobile": clean_mobile,
                    }
                },
            }
        )
    except Exception:
        pass

    return True, "Account registered successfully! You can now sign in."


# =========================================================
# RESET PASSWORD
# =========================================================

def reset_user_password(identifier: str, new_password: str) -> tuple[bool, str]:
    target = identifier.strip().lower()
    clean_target = re.sub(r"[^\d+]", "", target)

    if len(new_password) < 8:
        return False, "Password must be at least 8 characters."

    hashed = generate_password_hash(new_password)
    user_email = ""

    try:
        with get_connection(shared=True) as connection:
            admin = connection.execute(
                """
                SELECT id, username, email, mobile
                FROM admins
                WHERE LOWER(email) = ? OR LOWER(username) = ? OR mobile = ? OR mobile LIKE ?
                """,
                (target, target, clean_target, f"%{clean_target[-10:]}"),
            ).fetchone()

            if not admin:
                return False, "User account not found."

            user_email = admin["email"] or admin["username"]
            connection.execute(
                "UPDATE admins SET password_hash = ? WHERE id = ?",
                (hashed, admin["id"]),
            )
    except Exception as e:
        return False, f"Could not update password: {e}"

    # Also update in Supabase if email is available
    if user_email and "@" in user_email:
        try:
            supabase = get_supabase()
            supabase.auth.admin.update_user_by_id(
                user_email,
                {"password": new_password}
            )
        except Exception:
            pass

    return True, "Password has been successfully updated! You can now sign in with your new password."


# =========================================================
# UPDATE LIBRARY NAME
# =========================================================

def update_library_name(
    library_name: str,
) -> tuple[bool, str]:

    library_name = library_name.strip()

    username = st.session_state.get(
        "username",
        "",
    )

    if not library_name:
        return False, "Library name cannot be empty."

    if not username:
        return False, "Please sign in again."

    try:
        with get_connection(shared=True) as connection:
            connection.execute(
                """
                UPDATE admins
                SET library_name = ?
                WHERE username = ?
                """,
                (
                    library_name,
                    username,
                ),
            )

        st.session_state.library_name = library_name

        try:
            get_supabase().auth.update_user(
                {
                    "data": {
                        "library_name": library_name
                    }
                }
            )
        except Exception:
            pass

        return True, "Library name updated successfully."

    except Exception:
        return False, "Could not update library name."


# =========================================================
# AUTH STATUS
# =========================================================

def is_authenticated() -> bool:
    return bool(
        st.session_state.get(
            "authenticated",
            False,
        )
    )


# =========================================================
# LOGIN / REGISTER / FORGOT PASSWORD FORM
# =========================================================

def login_form() -> None:

    mode = st.radio(
        "Select Option",
        [
            "Sign in",
            "Register",
            "Forgot Password",
        ],
        horizontal=True,
    )

    # =====================================================
    # SIGN IN
    # =====================================================

    if mode == "Sign in":

        st.subheader("Sign in to SeatLedger")

        with st.form("login_form"):

            username = st.text_input(
                "Email or mobile or username",
                placeholder="Enter your registered email or username",
                key="signin_username",
            )

            password = st.text_input(
                "Password",
                type="password",
                placeholder="Enter your password",
                key="signin_password",
            )

            submitted = st.form_submit_button(
                "Sign in",
                type="primary",
                use_container_width=True,
            )

        if submitted:

            target = username.strip().lower()
            clean_target = re.sub(r"[^\d+]", "", target)

            if not target:
                st.error("Please enter your email, username, or mobile number.")
                return

            if not password:
                st.error("Please enter your password.")
                return

            # Check local SQLite first
            local_user = None
            try:
                with get_connection(shared=True) as connection:
                    local_user = connection.execute(
                        """
                        SELECT username, email, library_name, password_hash
                        FROM admins
                        WHERE LOWER(email) = ? OR LOWER(username) = ? OR (mobile != '' AND (mobile = ? OR mobile LIKE ?))
                        """,
                        (target, target, clean_target, f"%{clean_target[-10:]}" if len(clean_target) >= 10 else "---"),
                    ).fetchone()
            except Exception:
                pass

            if local_user and check_password_hash(local_user["password_hash"], password):
                _start_session(
                    local_user["username"],
                    local_user["library_name"] or "My Library",
                )
                st.success("Login successful!")
                st.rerun()
                return

            # Also fallback to Supabase if email is used
            if "@" in target:
                try:
                    supabase = get_supabase()
                    response = supabase.auth.sign_in_with_password(
                        {
                            "email": target,
                            "password": password,
                        }
                    )
                    if response.user:
                        metadata = response.user.user_metadata or {}
                        library_name = metadata.get("library_name", "My Library")
                        _start_session(target, library_name)
                        st.success("Login successful!")
                        st.rerun()
                        return
                except Exception:
                    pass

            st.error("Invalid email, username or password.")

    # =====================================================
    # REGISTER WITH EMAIL & MOBILE OTP
    # =====================================================

    elif mode == "Register":

        st.subheader("Create your SeatLedger account")

        # Step tracking in session state
        if "reg_step" not in st.session_state:
            st.session_state.reg_step = 1

        if st.session_state.reg_step == 1:
            with st.form("reg_step1_form"):
                full_name = st.text_input(
                    "Full Name *",
                    value=st.session_state.get("reg_full_name", ""),
                    placeholder="e.g. Rahul Sharma",
                    key="reg_name_input",
                )
                library_name = st.text_input(
                    "Library Name *",
                    value=st.session_state.get("reg_library_name", ""),
                    placeholder="e.g. Saraswati Library",
                    key="reg_lib_input",
                )
                email = st.text_input(
                    "Email Address *",
                    value=st.session_state.get("reg_email", ""),
                    placeholder="name@example.com",
                    key="reg_email_input",
                )
                mobile = st.text_input(
                    "Mobile Number *",
                    value=st.session_state.get("reg_mobile", ""),
                    placeholder="10-digit mobile number",
                    key="reg_mobile_input",
                )
                password = st.text_input(
                    "Create Password *",
                    type="password",
                    placeholder="Minimum 8 characters",
                    key="reg_pwd_input",
                )
                confirm_password = st.text_input(
                    "Confirm Password *",
                    type="password",
                    placeholder="Type the same password again",
                    key="reg_pwd2_input",
                )
                btn_send_otp = st.form_submit_button(
                    "Send OTP for Verification",
                    type="primary",
                    use_container_width=True,
                )

            if btn_send_otp:
                clean_mobile = re.sub(r"[^\d+]", "", mobile)
                if not full_name.strip():
                    st.error("Please enter your name.")
                elif not library_name.strip():
                    st.error("Please enter your library name.")
                elif "@" not in email or "." not in email:
                    st.error("Please enter a valid email address.")
                elif len(clean_mobile) < 10:
                    st.error("Please enter a valid 10-digit mobile number.")
                elif len(password) < 8:
                    st.error("Password must be at least 8 characters.")
                elif password != confirm_password:
                    st.error("Passwords do not match.")
                else:
                    # Check if already registered
                    try:
                        with get_connection(shared=True) as conn:
                            existing = conn.execute(
                                "SELECT id FROM admins WHERE LOWER(email) = ? OR mobile = ?",
                                (email.strip().lower(), clean_mobile),
                            ).fetchone()
                            if existing:
                                st.error("An account with this email or mobile number already exists.")
                                return
                    except Exception:
                        pass

                    # Generate OTPs
                    email_otp = generate_otp()
                    mobile_otp = generate_otp()

                    st.session_state.reg_data = {
                        "full_name": full_name.strip(),
                        "library_name": library_name.strip(),
                        "email": email.strip().lower(),
                        "mobile": clean_mobile,
                        "password": password,
                    }
                    st.session_state.reg_email_otp = email_otp
                    st.session_state.reg_mobile_otp = mobile_otp

                    # Send OTPs
                    _, email_msg = send_email_otp(email.strip(), email_otp, purpose="Registration")
                    _, mobile_msg = send_mobile_otp(clean_mobile, mobile_otp, purpose="Registration")

                    st.session_state.reg_email_msg = email_msg
                    st.session_state.reg_mobile_msg = mobile_msg
                    st.session_state.reg_step = 2
                    st.rerun()

        elif st.session_state.reg_step == 2:
            st.info(f"Verification OTPs sent for **{st.session_state.reg_data['email']}** and **{st.session_state.reg_data['mobile']}**")

            # Notification toasts / banners for simulated / demo mode delivery
            if "(Demo Mode)" in st.session_state.get("reg_email_msg", "") or "(Simulation)" in st.session_state.get("reg_email_msg", ""):
                st.warning(f"📩 {st.session_state.get('reg_email_msg')}")
            else:
                st.success(f"📩 {st.session_state.get('reg_email_msg')}")

            if "(Demo Mode)" in st.session_state.get("reg_mobile_msg", "") or "(Simulation)" in st.session_state.get("reg_mobile_msg", ""):
                st.warning(f"📱 {st.session_state.get('reg_mobile_msg')}")
            else:
                st.success(f"📱 {st.session_state.get('reg_mobile_msg')}")

            with st.form("reg_otp_form"):
                entered_email_otp = st.text_input("Enter 6-digit Email OTP", placeholder="123456")
                entered_mobile_otp = st.text_input("Enter 6-digit Mobile OTP", placeholder="123456")
                verify_btn = st.form_submit_button("Verify & Complete Registration", type="primary", use_container_width=True)

            col1, col2 = st.columns(2)
            if col1.button("Resend OTP", use_container_width=True):
                new_email_otp = generate_otp()
                new_mobile_otp = generate_otp()
                st.session_state.reg_email_otp = new_email_otp
                st.session_state.reg_mobile_otp = new_mobile_otp
                _, em_msg = send_email_otp(st.session_state.reg_data["email"], new_email_otp, purpose="Registration")
                _, mob_msg = send_mobile_otp(st.session_state.reg_data["mobile"], new_mobile_otp, purpose="Registration")
                st.session_state.reg_email_msg = em_msg
                st.session_state.reg_mobile_msg = mob_msg
                st.rerun()

            if col2.button("Edit Details", use_container_width=True):
                st.session_state.reg_step = 1
                st.rerun()

            if verify_btn:
                correct_email_otp = st.session_state.get("reg_email_otp")
                correct_mobile_otp = st.session_state.get("reg_mobile_otp")

                if entered_email_otp.strip() != correct_email_otp:
                    st.error("Invalid Email OTP. Please check the code.")
                elif entered_mobile_otp.strip() != correct_mobile_otp:
                    st.error("Invalid Mobile OTP. Please check the code.")
                else:
                    reg = st.session_state.reg_data
                    success, msg = register_user(
                        full_name=reg["full_name"],
                        email=reg["email"],
                        mobile=reg["mobile"],
                        library_name=reg["library_name"],
                        password=reg["password"],
                    )
                    if success:
                        st.session_state.reg_step = 1
                        st.session_state.pop("reg_data", None)
                        st.session_state.pop("reg_email_otp", None)
                        st.session_state.pop("reg_mobile_otp", None)
                        st.success(msg)
                    else:
                        st.error(msg)

    # =====================================================
    # FORGOT PASSWORD (RECOVERY VIA OTP)
    # =====================================================

    elif mode == "Forgot Password":

        st.subheader("Account Recovery / Forgot Password")

        if "fp_step" not in st.session_state:
            st.session_state.fp_step = 1

        if st.session_state.fp_step == 1:
            with st.form("forgot_step1_form"):
                recovery_target = st.text_input(
                    "Registered Email or 10-digit Mobile Number",
                    placeholder="Enter email or mobile",
                    key="fp_target_input",
                )
                otp_channel = st.radio(
                    "Send OTP to:",
                    ["Email", "Mobile"],
                    horizontal=True,
                )
                btn_send_fp_otp = st.form_submit_button(
                    "Send Recovery OTP",
                    type="primary",
                    use_container_width=True,
                )

            if btn_send_fp_otp:
                target = recovery_target.strip().lower()
                clean_target = re.sub(r"[^\d+]", "", target)

                if not target:
                    st.error("Please enter your registered email or mobile number.")
                    return

                # Find user in database
                user_found = None
                try:
                    with get_connection(shared=True) as connection:
                        user_found = connection.execute(
                            """
                            SELECT id, username, email, mobile, full_name
                            FROM admins
                            WHERE LOWER(email) = ? OR LOWER(username) = ? OR (mobile != '' AND (mobile = ? OR mobile LIKE ?))
                            """,
                            (target, target, clean_target, f"%{clean_target[-10:]}" if len(clean_target) >= 10 else "---"),
                        ).fetchone()
                except Exception:
                    pass

                if not user_found:
                    st.error("No account found matching this email or mobile number.")
                    return

                dest_email = user_found["email"] or user_found["username"]
                dest_mobile = user_found["mobile"]

                if otp_channel == "Email" and ("@" not in dest_email):
                    st.error("This account does not have a registered email address. Try mobile OTP.")
                    return

                if otp_channel == "Mobile" and (not dest_mobile or len(dest_mobile) < 10):
                    st.error("This account does not have a registered mobile number. Try email OTP.")
                    return

                fp_otp = generate_otp()
                st.session_state.fp_data = {
                    "username": user_found["username"],
                    "email": dest_email,
                    "mobile": dest_mobile,
                    "channel": otp_channel,
                }
                st.session_state.fp_otp = fp_otp

                if otp_channel == "Email":
                    _, fp_msg = send_email_otp(dest_email, fp_otp, purpose="Password Reset")
                else:
                    _, fp_msg = send_mobile_otp(dest_mobile, fp_otp, purpose="Password Reset")

                st.session_state.fp_msg = fp_msg
                st.session_state.fp_step = 2
                st.rerun()

        elif st.session_state.fp_step == 2:
            st.info(f"Recovery OTP sent via **{st.session_state.fp_data['channel']}** to: **{st.session_state.fp_data['email'] if st.session_state.fp_data['channel'] == 'Email' else st.session_state.fp_data['mobile']}**")

            if "(Demo Mode)" in st.session_state.get("fp_msg", "") or "(Simulation)" in st.session_state.get("fp_msg", ""):
                st.warning(f"🔑 {st.session_state.get('fp_msg')}")
            else:
                st.success(f"🔑 {st.session_state.get('fp_msg')}")

            with st.form("forgot_step2_form"):
                entered_otp = st.text_input("Enter 6-digit OTP", placeholder="123456")
                new_pwd = st.text_input("Enter New Password", type="password", placeholder="Minimum 8 characters")
                confirm_new_pwd = st.text_input("Confirm New Password", type="password", placeholder="Retype new password")
                btn_reset = st.form_submit_button("Reset Password", type="primary", use_container_width=True)

            col1, col2 = st.columns(2)
            if col1.button("Resend Code", use_container_width=True):
                new_otp = generate_otp()
                st.session_state.fp_otp = new_otp
                if st.session_state.fp_data["channel"] == "Email":
                    _, msg = send_email_otp(st.session_state.fp_data["email"], new_otp, purpose="Password Reset")
                else:
                    _, msg = send_mobile_otp(st.session_state.fp_data["mobile"], new_otp, purpose="Password Reset")
                st.session_state.fp_msg = msg
                st.rerun()

            if col2.button("Cancel / Back", use_container_width=True):
                st.session_state.fp_step = 1
                st.session_state.pop("fp_data", None)
                st.session_state.pop("fp_otp", None)
                st.rerun()

            if btn_reset:
                if entered_otp.strip() != st.session_state.get("fp_otp"):
                    st.error("Invalid OTP code. Please enter the correct code.")
                elif len(new_pwd) < 8:
                    st.error("New password must be at least 8 characters.")
                elif new_pwd != confirm_new_pwd:
                    st.error("Passwords do not match.")
                else:
                    success, message = reset_user_password(st.session_state.fp_data["username"], new_pwd)
                    if success:
                        st.session_state.fp_step = 1
                        st.session_state.pop("fp_data", None)
                        st.session_state.pop("fp_otp", None)
                        st.success(message)
                    else:
                        st.error(message)

    # =====================================================
    # GOOGLE LOGIN
    # =====================================================

    st.divider()

    if st.button(
        "Continue with Google",
        use_container_width=True,
    ):

        try:
            st.login("google")

        except Exception:
            st.warning(
                "Google login is not configured yet. "
                "You can use email and password login."
            )


# =========================================================
# LOGOUT
# =========================================================

def logout() -> None:

    try:
        get_supabase().auth.sign_out()
    except Exception:
        pass

    st.session_state.clear()

    st.query_params.pop(
        "session",
        None,
    )

    st.rerun()


# =========================================================
# USER HEADER
# =========================================================

def render_user_header(
    section_title: str,
) -> None:

    library_name = st.session_state.get(
        "library_name",
        "My Library",
    )

    st.markdown(
        f"""
        <div class="library-header">
            <div class="library-name">
                {library_name}
            </div>

            <div class="section-name">
                {section_title}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        """
        <style>

        .library-header {
            border-bottom: 2px solid #34586b;
            padding: 0 0 0.8rem 0;
            margin-bottom: 1.4rem;
        }

        .library-name {
            font-family: Georgia, serif;
            font-size: 2rem;
            font-weight: 700;
            color: #6fc1dd !important;
            letter-spacing: 0.02em;
        }

        .section-name {
            font-size: 1.05rem;
            font-weight: 700;
            color: #b9cbd5 !important;
            margin-top: 0.2rem;
        }

        label,
        p,
        span {
            color: #e8f1f5;
        }

        [data-testid="stMetricLabel"] {
            color: #e8f1f5 !important;
        }

        [data-testid="stMetricValue"] {
            color: #e8f1f5 !important;
        }

        [data-testid="stCaptionContainer"] p {
            color: #b9cbd5 !important;
        }

        </style>
        """,
        unsafe_allow_html=True,
    )
