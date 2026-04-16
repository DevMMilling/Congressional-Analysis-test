# Congressional App 20-Feature Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved 20-feature additive expansion across admin, exploration, research, and backtesting workflows.

**Architecture:** Extend the existing FastAPI and React/Vite application with backward-compatible routes, richer response types, shared list-query semantics, and additive UI pages/panels. Keep the local-first data model intact and favor new endpoints/helpers over deep refactors.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, Vite, Recharts, SQLite/PostgreSQL-compatible SQLAlchemy models

---

- [ ] Wave 1: Admin and observability
- [ ] Wave 2: Exploration and filtering
- [ ] Wave 3: Research workbench
- [ ] Wave 4: Backtesting, exports, and productivity
- [ ] Backend verification
- [ ] Frontend verification
