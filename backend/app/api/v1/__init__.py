from fastapi import APIRouter

from app.api.v1 import analysis, api_keys, auth, cases, documents, users, webhooks

api_router = APIRouter(prefix="/api/v1")
for r in (auth.router, analysis.router, cases.router, documents.claims_router, documents.docs_router,
          api_keys.router, webhooks.router, users.router):
    api_router.include_router(r)
