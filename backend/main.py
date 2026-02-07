from fastapi import FastAPI, Depends #type: ignore
from db import get_conn
from auth import require_user

app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/db-test")
def db_test():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select now() as server_time;")
            row = cur.fetchone()
            return {"db_ok": True, "result": row}
    finally:
        conn.close()

@app.get("/me")
def me(user=Depends(require_user)):
    return {"user_id": user["user_id"]}
