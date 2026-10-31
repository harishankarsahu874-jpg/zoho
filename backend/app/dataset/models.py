"""Dataset loading and change-file (disruption) application.

The dataset (cit_public.json) is the single source of truth. Nothing about it
is hard-coded anywhere else in the app; every solver receives a Context built
from the (possibly disrupted) dataset dict.
"""
from __future__ import annotations

import copy
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def load_json(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def apply_disruption(data: dict, dis: dict) -> dict:
    """Return a new dataset dict with all changes applied (permanent).

    Mirrors the official validator's semantics exactly:
      faculty_unavailable -> appended to the faculty's `unavailable` list
      room_unavailable    -> appended to `room_unavailability`
      add_faculty         -> appended to `faculty`
      add_session         -> appended to `sessions`
      remove_session      -> filtered out of `sessions`
    """
    d = copy.deepcopy(data)
    fac = {f["id"]: f for f in d["faculty"]}
    for ch in dis.get("changes", []):
        t = ch["type"]
        if t == "faculty_unavailable":
            for day in ch["days"]:
                fac[ch["faculty_id"]]["unavailable"].append(
                    {"day": day, "periods": ch["periods"], "reason": ch.get("reason", "")}
                )
        elif t == "room_unavailable":
            for day in ch["days"]:
                d["room_unavailability"].append(
                    {"room_id": ch["room_id"], "day": day, "periods": ch["periods"],
                     "reason": ch.get("reason", "")}
                )
        elif t == "add_faculty":
            d["faculty"].append(ch["faculty"])
            fac[ch["faculty"]["id"]] = ch["faculty"]
        elif t == "add_session":
            d["sessions"].append(ch["session"])
        elif t == "remove_session":
            d["sessions"] = [s for s in d["sessions"] if s["id"] != ch["session_id"]]
        else:
            raise ValueError(f"Unknown change type: {t}")
    return d


@dataclass
class Context:
    """Pre-computed index views over the dataset dict (same shapes the validator uses).

    fac_un/room_un are defaultdicts exactly like the validator's Ctx, so
    missing keys return empty sets.
    """

    data: dict
    days: list[str]
    lab_starts: set[int]
    lunch: int
    rooms: dict[str, dict]
    fac: dict[str, dict]
    groups: dict[str, dict]
    sessions: dict[str, dict]
    req: dict[str, dict]
    cancelled: set[str]
    fac_un: "defaultdict[str, set[tuple[str, int]]]"
    room_un: "defaultdict[str, set[tuple[str, int]]]"
    max_period: int = 13
    last_teaching: int = 9

    @classmethod
    def build(cls, data: dict) -> "Context":
        rooms = {r["id"]: r for r in data["rooms"]}
        fac = {f["id"]: f for f in data["faculty"]}
        groups = {g["id"]: g for g in data["student_groups"]}
        sessions = {s["id"]: s for s in data["sessions"]}
        req = {b["id"]: b for b in data["booking_requests"]}
        cancelled = {c["request_id"] for c in data.get("cancellations", [])}
        fac_un: dict[str, set[tuple[str, int]]] = defaultdict(set)
        for f in data["faculty"]:
            for u in f.get("unavailable", []):
                for p in u["periods"]:
                    fac_un[f["id"]].add((u["day"], p))
        room_un: dict[str, set[tuple[str, int]]] = defaultdict(set)
        for u in data.get("room_unavailability", []):
            for p in u["periods"]:
                room_un[u["room_id"]].add((u["day"], p))
        cal = data["calendar"]
        return cls(
            data=data,
            days=list(cal["days"]),
            lab_starts=set(cal["lab_start_periods"]),
            lunch=int(cal["lunch"]["after_period"]),
            rooms=rooms,
            fac=fac,
            groups=groups,
            sessions=sessions,
            req=req,
            cancelled=cancelled,
            fac_un=fac_un,
            room_un=room_un,
        )

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def block(start: int, dur: int) -> list[int]:
        return list(range(start, start + dur))

    def allowed_room(self, session: dict, room: dict) -> bool:
        """Static room compatibility for a session (type, capacity, access)."""
        if room["type"] not in session["room_types"]:
            return False
        if room["capacity"] < session["size"]:
            return False
        if session.get("needs_accessible") and not room["accessible"]:
            return False
        return True

    def room_unfree(self, room_id: str, day: str, period: int) -> bool:
        return (day, period) in self.room_un.get(room_id, ())

    def fac_unfree(self, fac_id: str, day: str, period: int) -> bool:
        return (day, period) in self.fac_un.get(fac_id, ())

    def max_hours_per_day(self, fac_id: str) -> int:
        return int(self.fac[fac_id].get("max_hours_per_day", 4))

    # ---------------- booking helpers (same semantics as the official validator)
    @staticmethod
    def effective_category(data: dict, req: dict) -> str:
        order = data["priority_order"]
        cap = data["role_category_cap"].get(req["role"], "club_event")
        a = order.index(req["requested_category"]) if req["requested_category"] in order else len(order) - 1
        return order[max(a, order.index(cap))]

    @classmethod
    def outranks(cls, data: dict, r1: dict, r2: dict) -> bool:
        order = data["priority_order"]
        c1 = order.index(cls.effective_category(data, r1))
        c2 = order.index(cls.effective_category(data, r2))
        if c1 != c2:
            return c1 < c2
        return r1["submitted_at"] < r2["submitted_at"]

    def booking_rank(self, req: dict) -> tuple[int, str, str]:
        """Sort key: priority category, then submission time, then id (stable)."""
        order = self.data["priority_order"]
        return (order.index(self.effective_category(self.data, req)),
                req["submitted_at"], req["id"])

    @staticmethod
    def room_features(room: dict) -> set[str]:
        feats = set(room["features"])
        if room["accessible"]:
            feats.add("accessible")
        return feats
