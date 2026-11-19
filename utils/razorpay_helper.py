import os
from typing import Dict

import razorpay

# --------------------------------------------------------------
#   Razorpay configuration – read from environment variables
# --------------------------------------------------------------
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
client = None

if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def create_order(amount_rupees: float, receipt: str) -> Dict:
    """
    Create a Razorpay order ready for the checkout UI.

    Parameters
    ----------
    amount_rupees: float
        Amount to be collected (in INR). Razorpay expects paise, so we multiply by 100.
    receipt: str
        Your internal identifier (e.g. "fee‑42‑2024‑05").

    Returns
    -------
    dict
        Full JSON response from Razorpay, containing at least the ``id`` (order_id).
    """
    if client is None:
        raise RuntimeError(
            "Razorpay credentials not found. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment before creating an order."
        )

    amount_paise = int(round(amount_rupees * 100))  # convert to paise
    data = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "payment_capture": 1,  # auto‑capture
    }
    return client.order.create(data)