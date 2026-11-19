import os
import random
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
import streamlit as st

def generate_otp() -> str:
    """Generate a 6-digit numeric OTP."""
    return f"{random.randint(100000, 999999)}"

def send_email_otp(to_email: str, otp: str, purpose: str = "Verification") -> tuple[bool, str]:
    """
    Send OTP via SMTP (e.g. Gmail / Outlook / SendGrid / Custom SMTP).
    Config is read from st.secrets['smtp'] or environment variables.
    If not configured, falls back to simulation mode so development/demo is never blocked.
    """
    to_email = to_email.strip()
    smtp_conf = {}
    try:
        if "smtp" in st.secrets:
            smtp_conf = st.secrets["smtp"]
    except Exception:
        pass

    host = smtp_conf.get("host") or os.environ.get("SMTP_HOST")
    port = int(smtp_conf.get("port") or os.environ.get("SMTP_PORT") or 587)
    user = smtp_conf.get("user") or os.environ.get("SMTP_USER")
    password = smtp_conf.get("password") or os.environ.get("SMTP_PASSWORD")
    from_email = smtp_conf.get("from_email") or user or "no-reply@seatledger.local"

    if host and user and password:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"SeatLedger {purpose} OTP: {otp}"
            msg["From"] = f"SeatLedger <{from_email}>"
            msg["To"] = to_email

            text_content = f"Your SeatLedger {purpose} OTP is: {otp}\nThis code is valid for 10 minutes. Please do not share it with anyone."
            html_content = f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f7f9fa; border-radius: 8px;">
                <h2 style="color: #102636;">SeatLedger Authentication</h2>
                <p>Use the following One-Time Password (OTP) for your <b>{purpose}</b>:</p>
                <div style="font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #198754; padding: 12px; background: #eaf5ee; border-radius: 6px; display: inline-block;">
                    {otp}
                </div>
                <p style="color: #6c757d; font-size: 13px; margin-top: 15px;">Valid for 10 minutes. Never share this OTP with anyone.</p>
            </div>
            """
            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                server.login(user, password)
                server.sendmail(from_email, [to_email], msg.as_string())
            return True, f"OTP sent to email {to_email}"
        except Exception as e:
            # Fallback to simulation with friendly note
            return True, f"(Simulation) OTP sent! Code is: {otp} [SMTP error: {e}]"
    else:
        # SMTP not configured, simulate delivery cleanly
        return True, f"(Demo Mode) Email OTP sent! Code is: {otp}"

def send_mobile_otp(mobile: str, otp: str, purpose: str = "Verification") -> tuple[bool, str]:
    """
    Send OTP via SMS (Fast2SMS or Twilio or Custom SMS webhook).
    Config is read from st.secrets['sms'] or environment variables.
    If not configured, falls back to simulation mode so app is always functional.
    """
    mobile = mobile.strip().replace(" ", "").replace("-", "")
    sms_conf = {}
    try:
        if "sms" in st.secrets:
            sms_conf = st.secrets["sms"]
    except Exception:
        pass

    # Check for Fast2SMS
    fast2sms_key = sms_conf.get("fast2sms_api_key") or os.environ.get("FAST2SMS_API_KEY")
    if fast2sms_key:
        try:
            # Fast2SMS requires 10-digit number for India
            num = mobile[-10:]
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = {
                "variables_values": otp,
                "route": "otp",
                "numbers": num
            }
            headers = {
                'authorization': fast2sms_key,
                'Content-Type': "application/x-www-form-urlencoded"
            }
            res = requests.post(url, data=payload, headers=headers, timeout=10)
            data = res.json()
            if data.get("return"):
                return True, f"SMS OTP sent to {mobile}"
            else:
                return True, f"(Simulation) SMS OTP for {mobile}: {otp} [Gateway: {data.get('message')}]"
        except Exception as e:
            return True, f"(Simulation) SMS OTP for {mobile}: {otp} [Error: {e}]"

    # Check for Twilio
    twilio_sid = sms_conf.get("twilio_sid") or os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_token = sms_conf.get("twilio_token") or os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_from = sms_conf.get("twilio_from") or os.environ.get("TWILIO_PHONE_NUMBER")

    if twilio_sid and twilio_token and twilio_from:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
            to_num = mobile if mobile.startswith("+") else f"+91{mobile[-10:]}"
            res = requests.post(
                url,
                data={
                    "From": twilio_from,
                    "To": to_num,
                    "Body": f"Your SeatLedger {purpose} OTP is: {otp}. Valid for 10 minutes."
                },
                auth=(twilio_sid, twilio_token),
                timeout=10
            )
            if res.status_code in (200, 201):
                return True, f"SMS OTP sent to {mobile}"
            else:
                return True, f"(Simulation) SMS OTP for {mobile}: {otp} [Twilio: {res.text}]"
        except Exception as e:
            return True, f"(Simulation) SMS OTP for {mobile}: {otp} [Error: {e}]"

    # Default simulation / demo fallback
    return True, f"(Demo Mode) Mobile OTP sent! Code is: {otp}"
