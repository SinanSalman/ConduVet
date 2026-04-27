"""
Shared rate-limiter instance.

Defined here (not in main.py) to avoid circular imports:
main.py imports the routers, and the routers need the limiter — keeping
the limiter in its own module breaks the cycle.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
