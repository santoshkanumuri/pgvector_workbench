import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt

from session_manager import get_metadata_pool
import asyncpg

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

JWT_SECRET = os.getenv("APP_JWT_SECRET", os.getenv("JWT_SECRET", "change-me"))
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))


class UserCreate(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    username: str
    created_at: datetime
    last_login_at: Optional[datetime]


async def get_user_by_username(conn: asyncpg.Connection, username: str):
    return await conn.fetchrow(
        "SELECT id, username, password_hash, created_at, last_login_at FROM db_look_users WHERE username = $1",
        username.lower(),
    )


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, created_at, last_login_at FROM db_look_users WHERE id = $1",
            user_id,
        )
    if not row:
        raise credentials_exception
    return UserOut(
        id=str(row["id"]),
        username=row["username"],
        created_at=row["created_at"],
        last_login_at=row["last_login_at"],
    )


@router.post("/register", response_model=UserOut)
async def register(user: UserCreate):
    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        existing = await get_user_by_username(conn, user.username)
        if existing:
            raise HTTPException(status_code=400, detail="Username already registered")
        user_id = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO db_look_users (id, username, password_hash, created_at)
            VALUES ($1, $2, $3, NOW())
            """,
            user_id,
            user.username.lower(),
            hash_password(user.password),
        )
        row = await conn.fetchrow(
            "SELECT id, username, created_at, last_login_at FROM db_look_users WHERE id = $1",
            user_id,
        )
    return UserOut(
        id=str(row["id"]), username=row["username"], created_at=row["created_at"], last_login_at=row["last_login_at"]
    )


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if JWT_SECRET == "change-me":
        # Warning for insecure default secret
        print("WARNING: Using default JWT secret. Set APP_JWT_SECRET in production.")
    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        user_row = await get_user_by_username(conn, form_data.username)
        if not user_row or not verify_password(form_data.password, user_row["password_hash"]):
            raise HTTPException(status_code=400, detail="Incorrect username or password")
        # update last login
        await conn.execute(
            "UPDATE db_look_users SET last_login_at = NOW() WHERE id = $1",
            user_row["id"],
        )
    token = create_access_token({"sub": str(user_row["id"])})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout(current_user: UserOut = Depends(get_current_user)):
    # For JWT tokens, logout is handled client-side by discarding the token
    # In a more complex system, you might maintain a blacklist of tokens
    return {"message": "Successfully logged out"}
