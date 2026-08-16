"""``app.services.workout_generator`` birim testleri."""

from __future__ import annotations

import random

from app.schemas.workout import WorkoutAnalyzeRequest
from app.services.workout_generator import (
    default_rest_days,
    detect_rest_days,
    determine_base_sets,
    generate_workout,
)


def test_detect_rest_days_finds_mentioned_day() -> None:
    prompt = "Pazartesi günü hiçbir şey yapmicam, tamamen dinlenme istiyorum"
    assert detect_rest_days(prompt) == ["Pazartesi"]


def test_detect_rest_days_multiple_days() -> None:
    prompt = "salı ve cuma günleri off olsun, diğer günler idman"
    assert detect_rest_days(prompt) == ["Salı", "Cuma"]


def test_detect_rest_days_no_match_returns_empty() -> None:
    assert detect_rest_days("bacak günü ağır olsun lütfen") == []


def test_default_rest_days_per_split_type() -> None:
    assert default_rest_days("ppl_torso_limbs") == ["Çarşamba", "Pazar"]
    assert default_rest_days("ppl") == ["Perşembe", "Pazar"]
    assert default_rest_days("upper_lower") == ["Çarşamba", "Cumartesi", "Pazar"]
    assert default_rest_days("torso_limbs") == ["Çarşamba", "Cumartesi", "Pazar"]


def test_determine_base_sets_bulk_young() -> None:
    assert determine_base_sets("bulk", 25) == "4x8-12 (RIR 0-1)"


def test_determine_base_sets_bulk_older_falls_back_to_default() -> None:
    assert determine_base_sets("bulk", 35) == "3x10-12"


def test_determine_base_sets_cut() -> None:
    assert determine_base_sets("cut", 40) == "3x8-10 (RIR 1-2 / Kas Koruma)"


def test_determine_base_sets_maintain() -> None:
    assert determine_base_sets("maintain", 40) == "3x10-12"


def test_generate_workout_is_deterministic_with_seeded_rng() -> None:
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    result_a = generate_workout(req, rng=random.Random(42))
    result_b = generate_workout(req, rng=random.Random(42))

    assert result_a == result_b


def test_generate_workout_applies_default_rest_days_when_none_detected() -> None:
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    result = generate_workout(req, rng=random.Random(1))

    assert result.workout_plan["Perşembe"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
    assert result.workout_plan["Pazar"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
    assert "PUSH GÜNÜ" in result.workout_plan["Pazartesi"]
    assert "PULL GÜNÜ" in result.workout_plan["Salı"]
    assert "LEGS GÜNÜ" in result.workout_plan["Çarşamba"]


def test_generate_workout_ai_analysis_mentions_goal_and_age() -> None:
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=27, goal="cut", weight=75)

    result = generate_workout(req, rng=random.Random(7))

    assert "cut" in result.ai_analysis
    assert "27" in result.ai_analysis
