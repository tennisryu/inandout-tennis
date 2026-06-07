"""
인앤아웃 테니스 클럽 - 대진 생성 서버
실행: python schedule_server.py
API 문서: http://localhost:5050/docs
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import random
import math
import os
import json
from pathlib import Path
from datetime import datetime

load_dotenv()  # .env 파일 로드

app = FastAPI(title="인앤아웃 테니스 대진 서버")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MATCHUP_DIR = Path(__file__).parent / "matchup_list"
MATCHUP_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────
# DB 연결
# ──────────────────────────────────────────
_db_url = os.environ.get("DATABASE_URL")
if _db_url:
    engine = create_engine(_db_url)
else:
    engine = create_engine(URL.create(
        drivername="postgresql",
        username="postgres",
        password="inandout4841!",
        host="localhost",
        port=5432,
        database="in_and_out_tennis"
    ))
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ──────────────────────────────────────────
# 기본 설정값
# ──────────────────────────────────────────
DEFAULT_CONFIG = {
    "w_team_balance": 3.0,
    "w_level_spread": 2.0,
    "w_repeat_partner": 6.0,
    "w_repeat_opponent": 2.0,
    "w_mixed_team": 2.0,
    "w_same_gender_team": 5.0,
    "w_all_female_court": 3.0,
    "prefer_women_court_min": 4,
    "transition_rounds": 3,
    "max_extra_games": 1,
    "min_games_each": 4,
    "heuristic_iters": 4000,
    "heuristic_restarts": 3,
    "w_game_balance": 5.0,
    "balance_post_passes": 3,
}


# ──────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────
def pair_key(a, b):
    return f"{min(a,b)}|{max(a,b)}"


def all_team_pairings(four):
    a, b, c, d = four
    return [([a, b], [c, d]), ([a, c], [b, d]), ([a, d], [b, c])]


def level_spread_penalty(four):
    levels = [p.get("level", 6) for p in four]
    mean = sum(levels) / 4
    return sum((v - mean) ** 2 for v in levels) / 4


def team_balance_penalty(t1, t2):
    s1 = (t1[0].get("level", 6)) + (t1[1].get("level", 6))
    s2 = (t2[0].get("level", 6)) + (t2[1].get("level", 6))
    return abs(s1 - s2)


def mixed_team_bonus(team):
    return -1.0 if team[0]["gender"] != team[1]["gender"] else 0.0


def same_gender_bonus(team):
    if team[0]["gender"] == team[1]["gender"]:
        return 0.0 if team[0]["gender"] == "여" else 1.0
    return 0.0


def all_female_court_bonus(four):
    return -8.0 if all(p["gender"] == "여" for p in four) else 0.0


def count_penalty(state, t1, t2):
    pk1 = pair_key(t1[0]["name"], t1[1]["name"])
    pk2 = pair_key(t2[0]["name"], t2[1]["name"])
    partner_pen = state["partnerCounts"].get(pk1, 0) + state["partnerCounts"].get(pk2, 0)
    opp_pen = 0
    for x in t1:
        for y in t2:
            opp_pen += state["opponentCounts"].get(pair_key(x["name"], y["name"]), 0)
    return partner_pen, opp_pen


def round_level_spread_weight(cfg, round_idx):
    tr = cfg.get("transition_rounds", 3)
    if tr <= 0:
        return cfg["w_level_spread"]
    t = min(1.0, round_idx / tr)
    return cfg["w_level_spread"] * (1.0 - 0.7 * t)


def matchup_penalty(t1, t2, matchups):
    pen = 0
    for a in t1:
        for b in t2:
            key = pair_key(a["name"], b["name"])
            mu = matchups.get(key)
            if not mu:
                continue
            a_stats = mu.get(a["name"])
            b_stats = mu.get(b["name"])
            if not a_stats or not b_stats or a_stats.get("total", 0) < 3:
                continue
            a_wr = a_stats["w"] / a_stats["total"]
            b_wr = b_stats["w"] / b_stats["total"]
            if a_wr >= 0.7 or b_wr >= 0.7:
                pen += 2.0
            elif a_wr >= 0.6 or b_wr >= 0.6:
                pen += 0.5
    return pen


def best_pairing_for_four(four, cfg, state):
    r_spread = round_level_spread_weight(cfg, state["roundIdx"])
    spread_pen = level_spread_penalty(four)
    num_females = state.get("selectedFemales", 0)
    matchups = state.get("matchups", {})

    game_bal_pen = 0
    if cfg.get("w_game_balance"):
        for p in four:
            target = state["targetGames"].get(p["name"], 0)
            played = state["playedCounts"].get(p["name"], 0)
            over = played - target
            if over >= 0:
                game_bal_pen += (over + 1) * 0.5

    best = None
    for t1, t2 in all_team_pairings(four):
        bal_pen = team_balance_penalty(t1, t2)
        partner_pen, opp_pen = count_penalty(state, t1, t2)
        mixed_b = mixed_team_bonus(t1) + mixed_team_bonus(t2)
        same_b = same_gender_bonus(t1) + same_gender_bonus(t2)
        female_cb = 0
        if num_females >= cfg.get("prefer_women_court_min", 4):
            female_cb = all_female_court_bonus(four)
        mu_pen = matchup_penalty(t1, t2, matchups) if matchups else 0
        score = (
            cfg["w_team_balance"] * bal_pen
            + r_spread * spread_pen
            + cfg["w_repeat_partner"] * partner_pen
            + cfg["w_repeat_opponent"] * opp_pen
            + cfg["w_mixed_team"] * mixed_b
            + cfg["w_same_gender_team"] * same_b
            + cfg["w_all_female_court"] * female_cb
            + cfg.get("w_game_balance", 0) * game_bal_pen
            + cfg["w_repeat_opponent"] * mu_pen
        )
        if best is None or score < best["score"]:
            best = {"score": score, "t1": t1, "t2": t2}
    return best


# ──────────────────────────────────────────
# 여자복식 코트 선점
# ──────────────────────────────────────────
def reserve_women_doubles_court(all_selected, cfg, state):
    females = [p for p in all_selected if p["gender"] == "여"]
    min_wd_target = 2

    if len(females) < 4:
        return {"womenCourt": None, "remainingPlayers": all_selected}

    need_wd = [p for p in females if state["womenDoublesCount"].get(p["name"], 0) < min_wd_target]
    if not need_wd:
        return {"womenCourt": None, "remainingPlayers": all_selected}

    sorted_females = sorted(females, key=lambda p: (
        state["womenDoublesCount"].get(p["name"], 0),
        state["playedCounts"].get(p["name"], 0),
    ))
    women_four = sorted_females[:4]
    women_names = {p["name"] for p in women_four}

    bp = best_pairing_for_four(women_four, cfg, state)
    remaining = [p for p in all_selected if p["name"] not in women_names]

    return {
        "womenCourt": {"four": women_four, "t1": bp["t1"], "t2": bp["t2"]},
        "remainingPlayers": remaining,
    }


# ──────────────────────────────────────────
# 전수 탐색 (2코트 이하, 12명 이하)
# ──────────────────────────────────────────
def exact_search(selected, cfg, state):
    C = cfg["_courts"]
    best = {"totalScore": None, "courtsDetail": None}

    def rec(remaining, built):
        if len(built) == C:
            total_score = 0
            courts_detail = []
            for four in built:
                bp = best_pairing_for_four(four, cfg, state)
                total_score += bp["score"]
                courts_detail.append({"four": four, "t1": bp["t1"], "t2": bp["t2"]})
            if best["totalScore"] is None or total_score < best["totalScore"]:
                best["totalScore"] = total_score
                best["courtsDetail"] = courts_detail
            return

        if len(remaining) < 4 * (C - len(built)):
            return

        n = len(remaining)
        for i in range(n - 3):
            for j in range(i + 1, n - 2):
                for k in range(j + 1, n - 1):
                    for l in range(k + 1, n):
                        four = [remaining[i], remaining[j], remaining[k], remaining[l]]
                        rest = [p for idx, p in enumerate(remaining) if idx not in (i, j, k, l)]
                        rec(rest, built + [four])

    rec(selected, [])
    return best if best["totalScore"] is not None else None


# ──────────────────────────────────────────
# 스네이크 초기 배치
# ──────────────────────────────────────────
def snake_initial_courts(selected, courts):
    sorted_p = sorted(selected, key=lambda p: p.get("level", 6), reverse=True)
    buckets = [[] for _ in range(courts)]
    fwd = list(range(courts))
    rev = list(reversed(fwd))
    idxs = fwd + rev
    for t, p in enumerate(sorted_p):
        buckets[idxs[t % len(idxs)]].append(p)
    return buckets


# ──────────────────────────────────────────
# 휴리스틱 로컬서치 (3코트+)
# ──────────────────────────────────────────
def heuristic_local_search(selected, cfg, state):
    C = cfg["_courts"]
    best_global = None

    for _ in range(cfg.get("heuristic_restarts", 3)):
        try:
            courts_players = snake_initial_courts(selected, C)
            if any(len(b) != 4 for b in courts_players):
                raise ValueError
        except Exception:
            flat = random.sample(selected, len(selected))
            courts_players = [flat[i * 4:(i + 1) * 4] for i in range(C)]

        cur_score = sum(best_pairing_for_four(b, cfg, state)["score"] for b in courts_players)
        best_score = cur_score
        best_players = [list(b) for b in courts_players]

        for _ in range(cfg.get("heuristic_iters", 4000)):
            c1 = random.randrange(C)
            c2 = random.randrange(C - 1)
            if c2 >= c1:
                c2 += 1
            i1 = random.randrange(4)
            i2 = random.randrange(4)

            before1 = list(courts_players[c1])
            before2 = list(courts_players[c2])

            courts_players[c1][i1], courts_players[c2][i2] = courts_players[c2][i2], courts_players[c1][i1]

            old_sc = (best_pairing_for_four(before1, cfg, state)["score"]
                      + best_pairing_for_four(before2, cfg, state)["score"])
            new_sc = (best_pairing_for_four(courts_players[c1], cfg, state)["score"]
                      + best_pairing_for_four(courts_players[c2], cfg, state)["score"])

            new_total = cur_score - old_sc + new_sc

            if new_total <= cur_score or random.random() < 0.02:
                cur_score = new_total
                if cur_score < best_score:
                    best_score = cur_score
                    best_players = [list(b) for b in courts_players]
            else:
                courts_players[c1] = before1
                courts_players[c2] = before2

        final_score = 0
        detail = []
        for four in best_players:
            bp = best_pairing_for_four(four, cfg, state)
            final_score += bp["score"]
            detail.append({"four": four, "t1": bp["t1"], "t2": bp["t2"]})

        if best_global is None or final_score < best_global["totalScore"]:
            best_global = {"totalScore": final_score, "courtsDetail": detail}

    return best_global


# ──────────────────────────────────────────
# 라운드별 선수 선택
# ──────────────────────────────────────────
def select_players_for_round(players, cfg, state):
    slots = 4 * cfg["_courts"]

    available = [
        p for p in players
        if not (p.get("_startRound") and state["roundIdx"] < p["_startRound"])
        and not (p.get("_endRound") is not None and state["roundIdx"] > p["_endRound"])
        and not (p.get("_maxGames", 0) > 0 and state["playedCounts"].get(p["name"], 0) >= p["_maxGames"])
    ]

    def can_extra(name):
        return state["remainingGames"].get(name, 0) > -cfg["max_extra_games"]

    need = [p for p in available if state["remainingGames"].get(p["name"], 0) > 0]
    extra = [p for p in available if state["remainingGames"].get(p["name"], 0) <= 0 and can_extra(p["name"])]
    eligible = need + extra
    by_name = {p["name"]: p for p in eligible}

    def balance_score(name):
        return state["targetGames"].get(name, 0) - state["playedCounts"].get(name, 0)

    must_play_names = {n for n in state["lastRoundRested"] if n in by_name}
    chosen = [by_name[n] for n in must_play_names]
    chosen_names = {p["name"] for p in chosen}

    # 여자복식 보장
    all_females = [p for p in eligible if p["gender"] == "여"]
    wd_needed = [p for p in all_females
                 if state.get("womenDoublesCount", {}).get(p["name"], 0) < 2]
    if len(all_females) >= 4 and wd_needed:
        female_sorted = sorted(
            [p for p in all_females if p["name"] not in chosen_names],
            key=lambda p: (
                state.get("womenDoublesCount", {}).get(p["name"], 0),
                -balance_score(p["name"]),
            ),
        )
        needed_female_count = max(0, 4 - sum(1 for p in chosen if p["gender"] == "여"))
        for p in female_sorted[:needed_female_count]:
            if len(chosen) < slots and p["name"] not in chosen_names:
                chosen.append(p)
                chosen_names.add(p["name"])

    remaining = sorted(
        [p for p in eligible if p["name"] not in chosen_names],
        key=lambda p: (
            -balance_score(p["name"]),
            state["playedCounts"].get(p["name"], 0),
            -state["remainingGames"].get(p["name"], 0),
        ),
    )
    for p in remaining:
        if len(chosen) >= slots:
            break
        if p["name"] not in chosen_names:
            chosen.append(p)
            chosen_names.add(p["name"])

    return chosen


# ──────────────────────────────────────────
# 라운드 결과 적용
# ──────────────────────────────────────────
def apply_round_result(state, courts_detail, players, cfg):
    played_names = set()
    for cd in courts_detail:
        four_players = cd["t1"] + cd["t2"]
        is_all_female = all(p["gender"] == "여" for p in four_players)
        for p in four_players:
            played_names.add(p["name"])
            state["remainingGames"][p["name"]] = state["remainingGames"].get(p["name"], 0) - 1
            state["playedCounts"][p["name"]] = state["playedCounts"].get(p["name"], 0) + 1
            if is_all_female and "womenDoublesCount" in state:
                state["womenDoublesCount"][p["name"]] = state["womenDoublesCount"].get(p["name"], 0) + 1

        pk1 = pair_key(cd["t1"][0]["name"], cd["t1"][1]["name"])
        pk2 = pair_key(cd["t2"][0]["name"], cd["t2"][1]["name"])
        state["partnerCounts"][pk1] = state["partnerCounts"].get(pk1, 0) + 1
        state["partnerCounts"][pk2] = state["partnerCounts"].get(pk2, 0) + 1
        for x in cd["t1"]:
            for y in cd["t2"]:
                ok = pair_key(x["name"], y["name"])
                state["opponentCounts"][ok] = state["opponentCounts"].get(ok, 0) + 1

    def can_extra(name):
        return state["remainingGames"].get(name, 0) > -cfg["max_extra_games"]

    eligible_names = set()
    for p in players:
        if p.get("_startRound") and state["roundIdx"] < p["_startRound"]:
            continue
        if p.get("_endRound") is not None and state["roundIdx"] > p["_endRound"]:
            continue
        if state["remainingGames"].get(p["name"], 0) > 0 or can_extra(p["name"]):
            eligible_names.add(p["name"])

    state["lastRoundRested"] = eligible_names - played_names
    state["roundIdx"] += 1


# ──────────────────────────────────────────
# 후처리 밸런싱 (개선)
# ──────────────────────────────────────────
def post_balance_schedule(schedule, game_counts, players, cfg):
    passes = cfg.get("balance_post_passes", 7)
    player_map = {p["name"]: p for p in players}

    def is_women_doubles_court(court):
        names = [court["a1"], court["a2"], court["b1"], court["b2"]]
        return all(player_map.get(n, {}).get("gender") == "여" for n in names)

    def is_available_for_round(round_obj, player_name):
        si = round_obj.get("slotIndex", -1)
        if si < 0:
            return True
        p = player_map.get(player_name)
        if not p or not p.get("_availableSlots"):
            return True
        slots = p["_availableSlots"]
        if si >= len(slots):
            return True
        return slots[si] is not False

    def get_court_type(court, ci, round_obj):
        """코트 유형 반환: 'women' / 'mixed' / 'same'"""
        names = [court["a1"], court["a2"], court["b1"], court["b2"]]
        genders = [player_map.get(n, {}).get("gender", "남") for n in names]
        female_count = genders.count("여")
        if female_count == 4:
            return "women"
        if female_count in (1, 2, 3):
            return "mixed"
        return "same"

    def team_partner(court, pos):
        """같은 팀의 파트너 이름 반환"""
        if pos == "a1": return court["a2"]
        if pos == "a2": return court["a1"]
        if pos == "b1": return court["b2"]
        return court["b1"]

    def can_swap(cp_name, wn, court, pos):
        """스왑 후 팀 구성이 유지되는지 확인"""
        cp_gender = player_map.get(cp_name, {}).get("gender", "남")
        wn_gender = player_map.get(wn, {}).get("gender", "남")

        # 성별이 같으면 항상 스왑 가능 (팀 구성 안 바뀜)
        if cp_gender == wn_gender:
            return True

        # 성별이 다른 경우 — 혼복 코트에서만 허용
        # 스왑 후 해당 팀이 혼복(남+여)을 유지하는지 확인
        partner_name = team_partner(court, pos)
        partner_gender = player_map.get(partner_name, {}).get("gender", "남")

        # 스왑 후 팀: (wn_gender + partner_gender) → 남+여 혼복이어야 함
        team_genders_after = {wn_gender, partner_gender}
        if team_genders_after == {"남", "여"}:
            return True  # 스왑 후에도 혼복 유지 ✅

        return False  # 팀이 남복 또는 여복이 되면 불가 ❌

    for _ in range(passes):
        counts = dict(game_counts)
        vals = list(counts.values())
        if not vals:
            break
        max_g, min_g = max(vals), min(vals)
        if max_g - min_g <= 1:
            break

        # 전체 라운드에서 스왑 후보를 (게임수 차이 내림차순)으로 수집
        swap_candidates = []
        for ri, round_obj in enumerate(schedule):
            waiting_names = round_obj.get("waiting", [])
            if not waiting_names:
                continue

            for ci, court in enumerate(round_obj["courts"]):
                if is_women_doubles_court(court):
                    continue

                for pos in ("a1", "a2", "b1", "b2"):
                    cp_name = court[pos]
                    cp_count = counts.get(cp_name, 0)
                    cp_level = player_map.get(cp_name, {}).get("level", 6)

                    for wn in waiting_names:
                        wn_count = counts.get(wn, 0)
                        diff = cp_count - wn_count
                        if diff < 2:
                            continue
                        if not is_available_for_round(round_obj, wn):
                            continue
                        wn_level = player_map.get(wn, {}).get("level", 6)
                        if abs(cp_level - wn_level) > 4:
                            continue
                        if not can_swap(cp_name, wn, court, pos):
                            continue
                        swap_candidates.append((diff, ri, ci, pos, cp_name, wn))

        if not swap_candidates:
            break

        # 게임 수 차이가 큰 스왑부터 처리
        swap_candidates.sort(key=lambda x: -x[0])

        swapped_players = set()
        any_swapped = False

        for diff, ri, ci, pos, cp_name, wn in swap_candidates:
            # 이미 이번 패스에서 스왑된 선수는 건너뜀
            if cp_name in swapped_players or wn in swapped_players:
                continue
            # counts 재확인 (이전 스왑으로 바뀌었을 수 있음)
            if counts.get(cp_name, 0) - counts.get(wn, 0) < 2:
                continue

            round_obj = schedule[ri]
            w_idx = round_obj["waiting"].index(wn)
            round_obj["courts"][ci][pos] = wn
            round_obj["waiting"][w_idx] = cp_name

            counts[cp_name] -= 1
            counts[wn] += 1
            game_counts[cp_name] -= 1
            game_counts[wn] += 1

            swapped_players.add(cp_name)
            swapped_players.add(wn)
            any_swapped = True

        if not any_swapped:
            break


# ──────────────────────────────────────────
# 시간대 슬롯 → 라운드 목록 변환
# ──────────────────────────────────────────
def expand_time_slots_to_rounds(time_slots, duration):
    rounds = []
    for si, slot in enumerate(time_slots):
        sh, sm = map(int, slot["start"].split(":"))
        eh, em = map(int, slot["end"].split(":"))
        start_min = sh * 60 + sm
        end_min = eh * 60 + em
        t = start_min
        while t + duration <= end_min:
            ts = f"{t // 60:02d}:{t % 60:02d}"
            te = f"{(t + duration) // 60:02d}:{(t + duration) % 60:02d}"
            rounds.append({"timeStart": ts, "timeEnd": te, "courts": slot["courts"], "slotIndex": si})
            t += duration
    return rounds


# ──────────────────────────────────────────
# 메인 대진 생성
# ──────────────────────────────────────────
def generate_schedule(players_raw, time_slots, duration, date, cfg, history=None):
    cfg = {**DEFAULT_CONFIG, **cfg}

    players = [dict(p) for p in players_raw]

    # 히스토리 반영 (파트너/상대 카운트)
    init_partner_counts = {}
    init_opponent_counts = {}
    if history:
        if history.get("usePartner") and history.get("partnerCounts"):
            init_partner_counts = {k: round(v * 0.5) for k, v in history["partnerCounts"].items()}
        if history.get("useMatchup") and history.get("opponentCounts"):
            init_opponent_counts = {k: round(v * 0.3) for k, v in history["opponentCounts"].items()}

    round_defs = expand_time_slots_to_rounds(time_slots, duration)
    if not round_defs:
        return None, "시간대 설정에서 최소 1라운드가 필요합니다."

    total_slots = sum(rd["courts"] * 4 for rd in round_defs)
    num_players = len(players)
    fair_target = round(total_slots / num_players) if num_players else 0

    state = {
        "remainingGames": {},
        "playedCounts": {},
        "targetGames": {},
        "partnerCounts": init_partner_counts,
        "opponentCounts": init_opponent_counts,
        "matchups": history.get("matchups", {}) if history and history.get("useMatchup") else {},
        "womenDoublesCount": {p["name"]: 0 for p in players if p.get("gender") == "여"},
        "lastRoundRested": set(),
        "roundIdx": 1,
        "selectedFemales": sum(1 for p in players if p.get("gender") == "여"),
    }

    total_rounds = len(round_defs)

    # 개인별 가용 라운드 계산
    for p in random.sample(players, len(players)):
        avail_rounds = 0
        for rd in round_defs:
            si = rd.get("slotIndex", -1)
            if si >= 0:
                slots = p.get("_availableSlots")
                is_avail = (slots is None or si >= len(slots) or slots[si] is not False)
            else:
                is_avail = True
            if is_avail:
                avail_rounds += 1

        avail_ratio = avail_rounds / total_rounds if total_rounds else 1
        personal_target = max(1, round(fair_target * avail_ratio))
        if p.get("_maxGames", 0) > 0:
            personal_target = min(personal_target, p["_maxGames"])
        state["remainingGames"][p["name"]] = personal_target
        state["targetGames"][p["name"]] = personal_target
        state["playedCounts"][p["name"]] = 0

    schedule = []
    game_counts = {p["name"]: 0 for p in players}

    for r, rd in enumerate(round_defs):
        courts_num = rd["courts"]
        cfg_r = {**cfg, "_courts": courts_num}

        # 해당 슬롯 가용 선수 필터링
        si = rd.get("slotIndex", -1)
        if si >= 0:
            available_players = [
                p for p in players
                if (p.get("_availableSlots") is None
                    or si >= len(p.get("_availableSlots", []))
                    or p["_availableSlots"][si] is not False)
            ]
        else:
            available_players = players

        selected = select_players_for_round(available_players, cfg_r, state)
        if len(selected) < 4:
            break

        usable_courts = min(courts_num, len(selected) // 4)
        if usable_courts == 0:
            break
        cfg_r["_courts"] = usable_courts

        # 여자복식 코트 선점
        result = None
        if usable_courts >= 2:
            wd_reserve = reserve_women_doubles_court(selected[: cfg_r["_courts"] * 4], cfg_r, state)
        else:
            wd_reserve = {"womenCourt": None, "remainingPlayers": selected[: cfg_r["_courts"] * 4]}

        if wd_reserve["womenCourt"] and usable_courts >= 2:
            remain_courts = usable_courts - 1
            remain_players = wd_reserve["remainingPlayers"]

            if remain_courts == 0:
                result = {"totalScore": 0, "courtsDetail": [wd_reserve["womenCourt"]]}
            elif len(remain_players) >= 4:
                remain_cfg = {**cfg_r, "_courts": remain_courts}
                if remain_courts <= 2 and len(remain_players) <= 12:
                    remain_result = exact_search(remain_players[: remain_courts * 4], remain_cfg, state)
                else:
                    remain_result = heuristic_local_search(remain_players[: remain_courts * 4], remain_cfg, state)

                if remain_result:
                    result = {
                        "totalScore": remain_result["totalScore"],
                        "courtsDetail": [wd_reserve["womenCourt"]] + remain_result["courtsDetail"],
                    }
                else:
                    result = {"totalScore": 0, "courtsDetail": [wd_reserve["womenCourt"]]}
            else:
                result = {"totalScore": 0, "courtsDetail": [wd_reserve["womenCourt"]]}
        else:
            if cfg_r["_courts"] <= 2 and len(selected) <= 12:
                result = exact_search(selected[: cfg_r["_courts"] * 4], cfg_r, state)
            else:
                result = heuristic_local_search(selected[: cfg_r["_courts"] * 4], cfg_r, state)

        if not result:
            break

        played_this_round = {p["name"] for cd in result["courtsDetail"] for p in cd["t1"] + cd["t2"]}
        waiting = [p for p in available_players if p["name"] not in played_this_round]

        court_assignments = [
            {"a1": cd["t1"][0]["name"], "a2": cd["t1"][1]["name"],
             "b1": cd["t2"][0]["name"], "b2": cd["t2"][1]["name"]}
            for cd in result["courtsDetail"]
        ]

        for cd in result["courtsDetail"]:
            for p in cd["t1"] + cd["t2"]:
                game_counts[p["name"]] = game_counts.get(p["name"], 0) + 1

        schedule.append({
            "round": r + 1,
            "timeStart": rd["timeStart"],
            "timeEnd": rd["timeEnd"],
            "courts": court_assignments,
            "waiting": [p["name"] for p in waiting],
            "score": result["totalScore"],
            "courtCount": usable_courts,
            "slotIndex": rd.get("slotIndex"),
        })

        apply_round_result(state, result["courtsDetail"], players, cfg_r)

    post_balance_schedule(schedule, game_counts, players, cfg)

    return {
        "date": date,
        "schedule": schedule,
        "gameCounts": game_counts,
        "players": [{"name": p["name"], "gender": p.get("gender"), "level": p.get("level")} for p in players],
    }, None


# ──────────────────────────────────────────
# DB API — 회원
# ──────────────────────────────────────────
@app.get("/api/members")
async def get_members():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT name, gender, level, type FROM members ORDER BY type, name"
        )).fetchall()
    return [{"name": r[0], "gender": r[1], "level": r[2], "type": r[3]} for r in rows]

@app.post("/api/members")
async def save_members(req: Request):
    body = await req.json()
    members = body.get("members", [])
    with engine.begin() as conn:
        for m in members:
            conn.execute(text("""
                INSERT INTO members (name, gender, level, type, updated_at)
                VALUES (:name, :gender, :level, :type, NOW())
                ON CONFLICT (name) DO UPDATE
                SET gender=:gender, level=:level, type=:type, updated_at=NOW()
            """), m)
    return {"status": "ok", "count": len(members)}

@app.put("/api/members/{name}")
async def update_member(name: str, req: Request):
    body = await req.json()
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE members SET gender=:gender, level=:level, type=:type, updated_at=NOW()
            WHERE name=:name
        """), {**body, "name": name})
    return {"status": "ok"}

@app.delete("/api/members/{name}")
async def delete_member(name: str):
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM members WHERE name=:name"), {"name": name})
    return {"status": "ok"}


# ──────────────────────────────────────────
# DB API — 경기 기록
# ──────────────────────────────────────────
@app.get("/api/matches")
async def get_matches():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, played_at, a1, a2, left_score, right_score, b1, b2 "
            "FROM matches ORDER BY played_at, id"
        )).fetchall()
    return [{"id": r[0], "d": str(r[1]), "a1": r[2], "a2": r[3],
             "ls": r[4], "rs": r[5], "b1": r[6], "b2": r[7]} for r in rows]

@app.post("/api/matches/add")
async def add_match(req: Request):
    m = await req.json()
    with engine.begin() as conn:
        row = conn.execute(text("""
            INSERT INTO matches (played_at, a1, a2, left_score, right_score, b1, b2)
            VALUES (:d, :a1, :a2, :ls, :rs, :b1, :b2) RETURNING id
        """), m).fetchone()
    return {"status": "ok", "id": row[0]}

@app.put("/api/matches/{match_id}")
async def update_match(match_id: int, req: Request):
    m = await req.json()
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE matches SET played_at=:d, a1=:a1, a2=:a2,
            left_score=:ls, right_score=:rs, b1=:b1, b2=:b2
            WHERE id=:id
        """), {**m, "id": match_id})
    return {"status": "ok"}

@app.delete("/api/matches/{match_id}")
async def delete_match(match_id: int):
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM matches WHERE id=:id"), {"id": match_id})
    return {"status": "ok"}

@app.post("/api/matches")
async def save_matches(req: Request):
    body = await req.json()
    matches = body.get("matches", [])
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM matches"))
        for m in matches:
            conn.execute(text("""
                INSERT INTO matches (played_at, a1, a2, left_score, right_score, b1, b2)
                VALUES (:d, :a1, :a2, :ls, :rs, :b1, :b2)
            """), m)
    return {"status": "ok", "count": len(matches)}


# ──────────────────────────────────────────
# DB API — 대진표
# ──────────────────────────────────────────
def _parse_schedule_row(row):
    """schedule_data가 리스트(배열)이거나 dict일 수 있음 - 둘 다 처리"""
    sched_data = row[1]
    if isinstance(sched_data, list):
        # 배열로 저장된 경우: schedule_data = [{round:1,...}, ...]
        return {
            "date": str(row[0]),
            "schedule": sched_data,
            "gameCounts": row[2] or {},
            "players": []
        }
    else:
        # dict로 저장된 경우: schedule_data = {schedule:[...], players:[...]}
        return {
            "date": str(row[0]),
            "schedule": sched_data.get("schedule", []),
            "gameCounts": row[2] or sched_data.get("gameCounts", {}),
            "players": sched_data.get("players", [])
        }

@app.get("/api/schedules/latest")
async def get_latest_schedule():
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT played_at, schedule_data, game_counts FROM schedules "
            "ORDER BY saved_at DESC LIMIT 1"
        )).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="저장된 대진이 없습니다.")
    return _parse_schedule_row(row)

@app.get("/api/schedules/list")
async def get_schedule_list():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT DISTINCT played_at FROM schedules ORDER BY played_at DESC"
        )).fetchall()
    return [str(r[0]) for r in rows]

@app.get("/api/schedules/{date}")
async def get_schedule(date: str):
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT played_at, schedule_data, game_counts FROM schedules "
            "WHERE played_at=:date ORDER BY saved_at DESC LIMIT 1"
        ), {"date": date}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="해당 날짜의 대진이 없습니다.")
    return _parse_schedule_row(row)

@app.post("/api/schedules/{date}")
async def save_schedule(date: str, req: Request):
    body = await req.json()
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO schedules (played_at, schedule_data, game_counts)
            VALUES (:date, :data, :counts)
        """), {
            "date": date,
            "data": json.dumps(body, ensure_ascii=False),
            "counts": json.dumps(body.get("gameCounts", {}), ensure_ascii=False)
        })
    return {"status": "ok", "date": date}


# ──────────────────────────────────────────
# API 엔드포인트
# ──────────────────────────────────────────
@app.post("/api/generate-schedule")
async def api_generate_schedule(req: Request):
    body = await req.json()

    players = body.get("players", [])
    time_slots = body.get("timeSlots", [])
    duration = body.get("duration", 30)
    date = body.get("date", "")
    cfg = body.get("config", {})
    history = body.get("history")

    if len(players) < 4:
        raise HTTPException(status_code=400, detail="최소 4명이 필요합니다.")
    if not time_slots:
        raise HTTPException(status_code=400, detail="시간대 설정이 없습니다.")

    result, err = generate_schedule(players, time_slots, duration, date, cfg, history)
    if err:
        raise HTTPException(status_code=400, detail=err)

    return result


def _get_files_for_date(date):
    return sorted(MATCHUP_DIR.glob(f"{date}_*.json"), reverse=True)

def _get_all_files():
    return sorted(MATCHUP_DIR.glob("*.json"), reverse=True)

def _get_dates_with_versions():
    from collections import defaultdict
    date_map = defaultdict(list)
    for f in _get_all_files():
        parts = f.stem.split("_")
        if len(parts) == 2:
            date_map[parts[0]].append({
                "filename": f.stem,
                "time": parts[1][:2] + ":" + parts[1][2:4] + ":" + parts[1][4:6]
            })
    return [{"date": d, "versions": v} for d, v in sorted(date_map.items(), reverse=True)]


@app.get("/api/schedule/latest")
async def api_schedule_latest():
    files = _get_all_files()
    if not files:
        raise HTTPException(status_code=404, detail="저장된 대진이 없습니다.")
    with open(files[0], "r", encoding="utf-8") as f:
        data = json.load(f)
    data["_filename"] = files[0].stem
    return data


@app.get("/api/schedule/list")
async def api_schedule_list():
    return _get_dates_with_versions()


@app.get("/api/schedule/{filename}")
async def api_schedule_get(filename: str):
    if "_" in filename and len(filename) > 10:
        filepath = MATCHUP_DIR / f"{filename}.json"
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="해당 파일을 찾을 수 없습니다.")
    else:
        files = _get_files_for_date(filename)
        if not files:
            raise HTTPException(status_code=404, detail="해당 날짜의 대진을 찾을 수 없습니다.")
        filepath = files[0]
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["_filename"] = filepath.stem
    return data


@app.post("/api/schedule/{date}")
async def api_schedule_save(date: str, req: Request):
    """새 버전 생성 (수동 저장 버튼용)"""
    from datetime import datetime
    body = await req.json()
    timestamp = datetime.now().strftime("%H%M%S")
    filename = f"{date}_{timestamp}"
    filepath = MATCHUP_DIR / f"{filename}.json"
    body["_savedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    body["_filename"] = filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "date": date, "filename": filename}


@app.put("/api/schedule/file/{filename}")
async def api_schedule_overwrite(filename: str, req: Request):
    """기존 파일 덮어쓰기 (자동저장용 — 새 버전 생성 안 함)"""
    from datetime import datetime
    body = await req.json()
    filepath = MATCHUP_DIR / f"{filename}.json"
    if not filepath.exists():
        # 파일 없으면 새로 생성
        date = filename.split("_")[0] if "_" in filename else filename
        timestamp = datetime.now().strftime("%H%M%S")
        filename = f"{date}_{timestamp}"
        filepath = MATCHUP_DIR / f"{filename}.json"
    body["_savedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    body["_filename"] = filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "filename": filename}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "인앤아웃_분석앱.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5050))
    print(f"🎾 인앤아웃 대진 서버 시작: http://localhost:{port}")
    print(f"📋 API 문서: http://localhost:{port}/docs")
    uvicorn.run("schedule_server:app", host="0.0.0.0", port=port, reload=True)
