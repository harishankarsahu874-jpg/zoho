from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..services import state
from .deps import get_current_user, issue_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not state.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid email or password")
    state.log(db, user.email, "auth.login")
    return {"token": issue_token(user),
            "user": {"email": user.email, "role": user.role, "name": user.name}}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"email": user.email, "role": user.role, "name": user.name}
