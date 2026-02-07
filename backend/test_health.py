from fastapi.testclient import TestClient  # type: ignore
from main import app

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
