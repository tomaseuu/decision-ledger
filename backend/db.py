import os
import psycopg2 # type: ignore
from psycopg2.extras import RealDictCursor # type: ignore
from dotenv import load_dotenv # type: ignore

load_dotenv()

def get_conn():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is missing. Did you create backend/.env ?")

    return psycopg2.connect(db_url, cursor_factory=RealDictCursor)
