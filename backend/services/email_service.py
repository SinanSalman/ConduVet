"""
Email service for ConduVet PIN authentication.
"""

from typing import Callable, Dict, Any


def send_pin_email(
    to_email: str,
    userid: str,
    pin_code: str,
    send_email_func: Callable,
    expiration_minutes: int = 15,
) -> bool:
    """Send PIN via email.

    Args:
        to_email: Email address to send PIN to
        userid: User ID (for greeting in email)
        pin_code: The PIN code to send
        send_email_func: Callable function to send email (typically from main.py)
        expiration_minutes: PIN expiration time in minutes

    Returns:
        True if successful, False otherwise.
    """
    subject = "Your ConduVet Login PIN"

    text_body = f"""Hello {userid},

Your ConduVet login PIN is: {pin_code}

This PIN will expire in {expiration_minutes} minutes.

If you did not request this PIN, please ignore this email.
"""

    try:
        # Call the provided send_email function
        send_email_func(to_email, subject, text_body)
        return True
    except Exception as e:
        print(f"Failed to send PIN email: {e}")
        return False
