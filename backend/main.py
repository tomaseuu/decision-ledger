from fastapi import FastAPI
from db import get_conn

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
