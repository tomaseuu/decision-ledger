import os
import requests  # type: ignore
from fastapi import Header, HTTPException  # type: ignore
from dotenv import load_dotenv  # type: ignore
from jose import jwt  # type: ignore

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") 

_jwks_cache = None

def _get_jwks():
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL missing in backend/.env")

    jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    resp = requests.get(jwks_url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache

def require_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization must be: Bearer <token>")

    token = authorization.split("Bearer ")[1].strip()

    # pick the right public key using the token header's "kid"
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Token missing kid")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token header")

    jwks = _get_jwks()
    key = None
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            key = k
            break
    if not key:
        raise HTTPException(status_code=401, detail="Unknown signing key (kid)")

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            options={"verify_aud": False},  # keep simple for now
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing sub (user id)")
        return {"user_id": user_id, "payload": payload}

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
