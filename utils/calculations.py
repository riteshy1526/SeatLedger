from typing import SupportsFloat


def calculate_due(monthly_fee: SupportsFloat, paid_amount: SupportsFloat) -> float:
    return max(0.0, float(monthly_fee) - float(paid_amount))
