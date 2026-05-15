"""
Email service for ConduVet PIN authentication.
"""

import os
from main import send_email


def send_pin_email(to_email: str, userid: str, pin_code: str) -> bool:
    """Send PIN via email.

    Uses the provided send_email() utility from main.py.

    Args:
        to_email: Email address to send PIN to
        userid: User ID (for greeting in email)
        pin_code: The PIN code to send

    Returns:
        True if successful, False otherwise.
    """
    subject = "Your ConduVet Login PIN"

    expiration_minutes = os.getenv("PIN_EXPIRATION_MINUTES", "15")

    text_body = f"""Hello {userid},

Your ConduVet login PIN is: {pin_code}

This PIN will expire in {expiration_minutes} minutes.

If you did not request this PIN, please ignore this email.
"""

    try:
        # Call the provided send_email() function from main.py
        send_email(to_email, subject, text_body)
        return True
    except Exception as e:
        print(f"Failed to send PIN email: {e}")
        return False
