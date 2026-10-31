"""FastAPI auth dependencies (JWT)."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import User

bearer = HTTPBearer(auto_error=False)


def issue_token(user: User) -> str:
    s = get_settings()
    return jwt.encode({"sub": user.email, "role": user.role},
                      s.jwt_secret, algorithm=s.jwt_algorithm)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                     db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(401, "not authenticated")
    s = get_settings()
    try:
        payload = jwt.decode(creds.credentials, s.jwt_secret,
                             algorithms=[s.jwt_algorithm])
    except JWTError:
        raise HTTPException(401, "invalid token")
    user = db.query(User).filter(User.email == payload.get("sub")).first()
    if user is None:
        raise HTTPException(401, "unknown user")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, f"requires role: {', '.join(roles)}")
        return user
    return dep
