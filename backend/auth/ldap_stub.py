from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthProvider:
    """Base authentication provider interface."""

    def authenticate(self, userid: str, password: str, db) -> bool:
        raise NotImplementedError


class LocalAuthProvider(AuthProvider):
    """Authenticates users against the app_users table using bcrypt hashes."""

    def authenticate(self, userid: str, password: str, db) -> bool:
        from models.db_models import AppUser

        # Case-insensitive lookup — stored uppercase
        user = db.query(AppUser).filter(
            AppUser.userid == userid.upper()
        ).first()
        if user is None:
            return False
        return pwd_context.verify(password, user.password_hash)


# class LDAPAuthProvider(AuthProvider):
#     """TODO: implement for LDAP authentication."""
#     def authenticate(self, userid: str, password: str, db) -> bool:
#         import ldap3
#         ...


# Active provider — swap this out to change authentication backend
auth_provider = LocalAuthProvider()
