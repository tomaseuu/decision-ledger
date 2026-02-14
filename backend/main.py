import logging
import time
from fastapi import FastAPI, Depends, HTTPException, Request  # type: ignore
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel  # type: ignore
from db import get_conn
from auth import require_user

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# request logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("decision-ledger")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        ms,
    )
    return response


# ensure user exists
def ensure_user(conn, user_id: str):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (id, email, name)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
            """,
            (user_id, f"{user_id}@placeholder.local", "Unknown"),
        )


# health check
@app.get("/health")
def health():
    return {"ok": True}


# DB connectivity check
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


# current user id (from token)
@app.get("/me")
def me(user=Depends(require_user)):
    return {"user_id": user["user_id"]}


# list my workspaces
@app.get("/workspaces")
def list_workspaces():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT w.id, w.name, w.created_at
                FROM workspaces w
                ORDER BY w.created_at DESC;
                """
            )
            rows = cur.fetchall()
            return [
                {"id": row["id"], "name": row["name"], "created_at": row["created_at"]}
                for row in rows
            ]
    finally:
        conn.close()


# create workspace payload
class WorkspaceCreate(BaseModel):
    name: str


# create workspace + add me as admin
@app.post("/workspaces", status_code=201)
def create_workspace(body: WorkspaceCreate, user=Depends(require_user)):
    conn = get_conn()
    try:
        ensure_user(conn, user["user_id"])

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workspaces (name, created_by)
                VALUES (%s, %s)
                RETURNING id, name, created_at;
                """,
                (body.name, user["user_id"]),
            )
            workspace = cur.fetchone()

            cur.execute(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES (%s, %s, 'admin')
                ON CONFLICT (workspace_id, user_id) DO NOTHING;
                """,
                (workspace["id"], user["user_id"]),
            )

        conn.commit()
        return workspace
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# get workspace (member-only)
@app.get("/workspaces/{workspace_id}")
def get_workspace(workspace_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, created_at
                FROM workspaces
                WHERE id = %s;
                """,
                (workspace_id,),
            )
            workspace = cur.fetchone()
            if not workspace:
                raise HTTPException(status_code=404, detail="Workspace not found")

            cur.execute(
                """
                SELECT role
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            member = cur.fetchone()
            if not member:
                raise HTTPException(
                    status_code=403, detail="Not a member of this workspace"
                )

            return workspace
    finally:
        conn.close()


# delete workspace (admin-only)
@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 1) workspace exists?
            cur.execute(
                "SELECT id, created_by FROM workspaces WHERE id = %s;",
                (workspace_id,),
            )
            ws = cur.fetchone()
            if not ws:
                raise HTTPException(status_code=404, detail="Workspace not found")

            # 2) must be a member + admin
            cur.execute(
                """
                SELECT role
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            member = cur.fetchone()
            if not member:
                raise HTTPException(status_code=403, detail="Not a member")

            role = (member["role"] or "").lower()
            if role not in ["admin", "owner"]:
                raise HTTPException(status_code=403, detail="Not allowed")

            # 3) delete children using workspace_id (no ANY/list issues)
            cur.execute(
                """
                DELETE FROM decision_details
                WHERE decision_id IN (SELECT id FROM decisions WHERE workspace_id = %s);
                """,
                (workspace_id,),
            )
            cur.execute(
                """
                DELETE FROM decision_options
                WHERE decision_id IN (SELECT id FROM decisions WHERE workspace_id = %s);
                """,
                (workspace_id,),
            )
            cur.execute(
                """
                DELETE FROM decision_revisions
                WHERE decision_id IN (SELECT id FROM decisions WHERE workspace_id = %s);
                """,
                (workspace_id,),
            )
            cur.execute("DELETE FROM decisions WHERE workspace_id = %s;", (workspace_id,))

            # 4) remove members, then workspace
            cur.execute(
                "DELETE FROM workspace_members WHERE workspace_id = %s;", (workspace_id,)
            )
            cur.execute("DELETE FROM workspaces WHERE id = %s;", (workspace_id,))

        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# list decisions in a workspace
@app.get("/workspaces/{workspace_id}/decisions")
def list_decisions(workspace_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM workspaces WHERE id = %s;", (workspace_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Workspace not found")

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=403, detail="Not a member of this workspace"
                )

            cur.execute(
                """
                SELECT id, title, status, owner_id, created_at, updated_at
                FROM decisions
                WHERE workspace_id = %s
                ORDER BY created_at DESC;
                """,
                (workspace_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


# create decision payload
class DecisionCreate(BaseModel):
    title: str
    status: str = "proposed"


# create a decision in a workspace
@app.post("/workspaces/{workspace_id}/decisions", status_code=201)
def create_decision(workspace_id: str, body: DecisionCreate, user=Depends(require_user)):
    conn = get_conn()
    try:
        ensure_user(conn, user["user_id"])

        with conn.cursor() as cur:
            cur.execute("SELECT id FROM workspaces WHERE id = %s;", (workspace_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Workspace not found")

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=403, detail="Not a member of this workspace"
                )

            cur.execute(
                """
                INSERT INTO decisions (workspace_id, title, status, owner_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id, workspace_id, title, status, owner_id, created_at, updated_at;
                """,
                (workspace_id, body.title, body.status, user["user_id"]),
            )
            decision = cur.fetchone()

        conn.commit()
        return decision
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# get decision (member-only)
@app.get("/decisions/{decision_id}")
def get_decision(decision_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, workspace_id, title, status, owner_id, created_at, updated_at
                FROM decisions
                WHERE id = %s;
                """,
                (decision_id,),
            )
            decision = cur.fetchone()
            if not decision:
                raise HTTPException(status_code=404, detail="Decision not found")

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (decision["workspace_id"], user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            return decision
    finally:
        conn.close()


# get decision details
@app.get("/decisions/{decision_id}/details")
def get_decision_details(decision_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT workspace_id FROM decisions WHERE id = %s;",
                (decision_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                SELECT decision_id, context, final_decision, rationale
                FROM decision_details
                WHERE decision_id = %s;
                """,
                (decision_id,),
            )
            details = cur.fetchone()
            if not details:
                raise HTTPException(status_code=404, detail="Decision details not found")

            return details
    finally:
        conn.close()


# delete decision (member-only)
@app.delete("/decisions/{decision_id}")
def delete_decision(decision_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, workspace_id FROM decisions WHERE id = %s;",
                (decision_id,),
            )
            decision = cur.fetchone()
            if not decision:
                raise HTTPException(status_code=404, detail="Decision not found")

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (decision["workspace_id"], user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                "DELETE FROM decision_details WHERE decision_id = %s;", (decision_id,)
            )
            cur.execute(
                "DELETE FROM decision_options WHERE decision_id = %s;", (decision_id,)
            )
            cur.execute(
                "DELETE FROM decision_revisions WHERE decision_id = %s;", (decision_id,)
            )
            cur.execute("DELETE FROM decisions WHERE id = %s;", (decision_id,))

        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# upsert decision details payload
class DecisionDetailsUpsert(BaseModel):
    context: str
    final_decision: str
    rationale: str


# upsert decision details
@app.put("/decisions/{decision_id}/details")
def upsert_decision_details(
    decision_id: str, body: DecisionDetailsUpsert, user=Depends(require_user)
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT workspace_id FROM decisions WHERE id = %s;",
                (decision_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                INSERT INTO decision_details (decision_id, context, final_decision, rationale)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (decision_id) DO UPDATE
                SET context = EXCLUDED.context,
                    final_decision = EXCLUDED.final_decision,
                    rationale = EXCLUDED.rationale
                RETURNING decision_id, context, final_decision, rationale;
                """,
                (decision_id, body.context, body.final_decision, body.rationale),
            )
            details = cur.fetchone()

        conn.commit()
        return details
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# list decision options
@app.get("/decisions/{decision_id}/options")
def list_decision_options(decision_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT workspace_id FROM decisions WHERE id = %s;", (decision_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                SELECT id, decision_id, option_name, pros, cons, is_chosen, created_at
                FROM decision_options
                WHERE decision_id = %s
                ORDER BY created_at ASC;
                """,
                (decision_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


# create option payload
class OptionCreate(BaseModel):
    option_name: str
    pros: str | None = None
    cons: str | None = None


# create an option
@app.post("/decisions/{decision_id}/options", status_code=201)
def create_option(decision_id: str, body: OptionCreate, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT workspace_id FROM decisions WHERE id = %s;", (decision_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                INSERT INTO decision_options (decision_id, option_name, pros, cons)
                VALUES (%s, %s, %s, %s)
                RETURNING id, decision_id, option_name, pros, cons, is_chosen, created_at;
                """,
                (decision_id, body.option_name, body.pros, body.cons),
            )
            option = cur.fetchone()

        conn.commit()
        return option
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# choose an option (only one chosen)
@app.put("/options/{option_id}/choose")
def choose_option(option_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT o.decision_id, d.workspace_id
                FROM decision_options o
                JOIN decisions d ON d.id = o.decision_id
                WHERE o.id = %s;
                """,
                (option_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Option not found")

            decision_id = row["decision_id"]
            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                UPDATE decision_options
                SET is_chosen = false
                WHERE decision_id = %s;
                """,
                (decision_id,),
            )

            cur.execute(
                """
                UPDATE decision_options
                SET is_chosen = true
                WHERE id = %s
                RETURNING id, decision_id, option_name, is_chosen;
                """,
                (option_id,),
            )
            chosen = cur.fetchone()

        conn.commit()
        return chosen
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

@app.delete("/options/{option_id}")
def delete_option(option_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Find option + workspace for permission check
            cur.execute(
                """
                SELECT o.id, o.decision_id, d.workspace_id
                FROM decision_options o
                JOIN decisions d ON d.id = o.decision_id
                WHERE o.id = %s;
                """,
                (option_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Option not found")

            workspace_id = row["workspace_id"]

            # Must be a workspace member
            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            # Delete the option
            cur.execute("DELETE FROM decision_options WHERE id = %s;", (option_id,))

        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# create revision payload
class RevisionCreate(BaseModel):
    summary: str


# add revision (append-only)
@app.post("/decisions/{decision_id}/revisions", status_code=201)
def create_revision(decision_id: str, body: RevisionCreate, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT workspace_id FROM decisions WHERE id = %s;", (decision_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                INSERT INTO decision_revisions (decision_id, author_id, summary)
                VALUES (%s, %s, %s)
                RETURNING id, decision_id, author_id, summary, created_at;
                """,
                (decision_id, user["user_id"], body.summary),
            )
            revision = cur.fetchone()

        conn.commit()
        return revision
    finally:
        conn.close()


# list revisions
@app.get("/decisions/{decision_id}/revisions")
def list_revisions(decision_id: str, user=Depends(require_user)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT workspace_id FROM decisions WHERE id = %s;", (decision_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Decision not found")

            workspace_id = row["workspace_id"]

            cur.execute(
                """
                SELECT 1
                FROM workspace_members
                WHERE workspace_id = %s AND user_id = %s;
                """,
                (workspace_id, user["user_id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed")

            cur.execute(
                """
                SELECT id, author_id, summary, created_at
                FROM decision_revisions
                WHERE decision_id = %s
                ORDER BY created_at DESC;
                """,
                (decision_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()
