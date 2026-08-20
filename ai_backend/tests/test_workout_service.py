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
    assert determine_base_sets("bulk", 25, "compound") == "4x5-8 (RIR 3)"
    assert determine_base_sets("bulk", 25, "isolation") == "3x10-15 (RIR 3)"


def test_determine_base_sets_bulk_older_uses_lower_volume() -> None:
    assert determine_base_sets("bulk", 35, "compound") == "4x6-8 (RIR 3)"
    assert determine_base_sets("bulk", 35, "isolation") == "3x10-12 (RIR 3)"


def test_determine_base_sets_cut_marks_muscle_retention() -> None:
    assert determine_base_sets("cut", 40, "compound") == "3x6-8 (RIR 3 / Kas Koruma)"
    assert determine_base_sets("cut", 40, "isolation") == "3x12-15 (RIR 3 / Kas Koruma)"


def test_determine_base_sets_maintain() -> None:
    assert determine_base_sets("maintain", 40, "compound") == "3x6-8 (RIR 3)"
    assert determine_base_sets("maintain", 40, "isolation") == "3x10-12 (RIR 3)"


def test_determine_base_sets_defaults_to_compound_week_one() -> None:
    assert determine_base_sets("maintain", 40) == determine_base_sets("maintain", 40, "compound", week=1)


def test_determine_base_sets_compound_and_isolation_differ() -> None:
    """Aynı seansta bileşik ve izolasyon hareketleri AYNI şemayı almaz."""
    for goal in ("bulk", "cut", "maintain"):
        compound = determine_base_sets(goal, 25, "compound")  # type: ignore[arg-type]
        isolation = determine_base_sets(goal, 25, "isolation")  # type: ignore[arg-type]
        assert compound != isolation


def test_determine_base_sets_progresses_over_four_weeks() -> None:
    """4 haftalık dalga: RIR düşer, son iki haftada set sayısı artar."""
    weekly = [determine_base_sets("bulk", 25, "compound", week=w) for w in range(1, 5)]

    assert weekly == [
        "4x5-8 (RIR 3)",
        "4x5-8 (RIR 2)",
        "5x5-8 (RIR 1)",
        "5x5-8 (RIR 0/1)",
    ]


def test_determine_base_sets_clamps_week_out_of_range() -> None:
    assert determine_base_sets("bulk", 25, "compound", week=0) == determine_base_sets("bulk", 25, "compound", week=1)
    assert determine_base_sets("bulk", 25, "compound", week=99) == determine_base_sets("bulk", 25, "compound", week=4)


def test_generate_workout_uses_different_schemes_within_a_session() -> None:
    """Squat ile yan kaldırış aynı set/tekrarı almaz (slot etiketi farklılaştırır)."""
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    plan = generate_workout(req, rng=random.Random(42)).workout_plan["Pazartesi"]
    exercise_lines = [line for line in plan.splitlines() if line and line[0].isdigit()]

    assert any("4x5-8 (RIR 3)" in line for line in exercise_lines)
    assert any("3x10-15 (RIR 3)" in line for line in exercise_lines)


def test_generate_workout_includes_weekly_progression_line() -> None:
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    plan = generate_workout(req, rng=random.Random(42)).workout_plan["Pazartesi"]

    assert "4 haftalık ilerleme" in plan
    assert "RIR 3→2→1→0/1" in plan


def test_progression_line_has_no_hyphen() -> None:
    """İlerleme satırı web tarafındaki yedek ayrıştırıcıya egzersiz gibi görünmemeli.

    ``parseDayPlan`` tire içeren satırları egzersiz sanar; ilerleme satırında
    tire olmaması bilinçli bir kısıttır.
    """
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    plan = generate_workout(req, rng=random.Random(3)).workout_plan["Pazartesi"]
    progression = [line for line in plan.splitlines() if "haftalık ilerleme" in line]

    assert len(progression) == 1
    assert "-" not in progression[0]


def test_generate_workout_message_is_honest_about_being_rule_based() -> None:
    """Motor kural tabanlıdır; çıktı kendini yapay zeka olarak TANITMAZ (ADR-0021)."""
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    result = generate_workout(req, rng=random.Random(1))
    haystack = " ".join([result.message, result.ai_analysis, *result.workout_plan.values()]).lower()

    assert "yapay zeka" not in haystack
    assert "kural tabanlı" in result.message.lower()


def test_generate_workout_analysis_contains_single_rationale_line() -> None:
    req = WorkoutAnalyzeRequest(split_type="ppl", user_prompt="", age=25, goal="bulk", weight=80)

    analysis = generate_workout(req, rng=random.Random(1)).ai_analysis

    assert analysis.count("Gerekçe:") == 1
    assert "progresif aşırı yükleme" in analysis


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
