# Gerekli kütüphaneleri kurmak için terminalde: pip install fastapi uvicorn pydantic scikit-learn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random

app = FastAPI()

# React'tan gelecek istekleri kabul etmek için CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Güvenlik için canlıya alırken "http://localhost:3000" yap
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. ANTRENMAN YAPAY ZEKASI (WORKOUT AI)
# ==========================================
class WorkoutRequest(BaseModel):
    split_type: str
    user_prompt: str
    age: int
    goal: str
    weight: float

@app.post("/api/generate-ai-workout")
async def generate_ai_workout(req: WorkoutRequest):
    prompt_lower = req.user_prompt.lower()
    rest_days = []
    days = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"]
    
    for day in days:
        if day in prompt_lower and any(word in prompt_lower for word in ["yok", "off", "dinlenme", "yapmicam"]):
            rest_days.append(day.capitalize())

    base_sets = "4x10"
    if req.goal == "bulk" and req.age < 30:
        base_sets = "4x8-12 (Tükeniş - RIR 0)"
    elif req.goal == "cut":
        base_sets = "3x10 (Kas koruma - RIR 1-2)"

    generated_plan = {}
    split_logic = {
        "ppl_torso_limbs": ["Push", "Pull", "Legs", "Torso", "Limbs"],
        "ppl": ["Push", "Pull", "Legs"],
        "upper_lower": ["Upper", "Lower"]
    }
    
    flow = split_logic.get(req.split_type, ["Full Body"])
    flow_idx = 0
    
    for day in days:
        cap_day = day.capitalize()
        if cap_day in rest_days:
            generated_plan[cap_day] = "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
        else:
            muscle = flow[flow_idx % len(flow)]
            if muscle == "Push":
                plan = f"1. Incline Dumbbell Press - {base_sets}\n2. Flat Bench Press - {base_sets}\n3. Cable Crossover - 3x15 (Failure)\n4. Lateral Raise - 4x15 (Beyond Failure)"
            elif muscle == "Torso":
                plan = f"1. Incline Barbell Press - {base_sets}\n2. T-Bar Row - {base_sets}\n3. Lat Pulldown - 4x10\n4. Machine Fly - 3x12"
            else:
                plan = f"--- {muscle.upper()} GÜNÜ ---\n(Yapay zeka tarafından optimize edilmiş hareketler)"
                
            generated_plan[cap_day] = plan
            flow_idx += 1

    return {
        "status": "success",
        "message": "AI programı başarıyla oluşturdu.",
        "ai_analysis": f"Hedef: {req.goal}, Yaş: {req.age}. Dinlenme günleri algılandı: {rest_days}",
        "workout_plan": generated_plan
    }

# ==========================================
# 2. BESLENME & DİYET YAPAY ZEKASI (NUTRITION AI)
# ==========================================
class DietRequest(BaseModel):
    age: int
    height_cm: float
    weight_kg: float
    gender: str
    steps: int
    goal: str
    user_prompt: str

@app.post("/api/generate-ai-diet")
async def generate_ai_diet(req: DietRequest):
    # 1. BMR ve TDEE Hesaplaması
    bmr = (10 * req.weight_kg) + (6.25 * req.height_cm) - (5 * req.age)
    bmr += 5 if req.gender == 'male' else -161

    if req.steps < 5000: multiplier = 1.2
    elif req.steps < 8000: multiplier = 1.375
    elif req.steps < 10000: multiplier = 1.55
    elif req.steps < 12000: multiplier = 1.725
    else: multiplier = 1.9

    tdee = bmr * multiplier

    if req.goal == 'cut': tdee -= 500
    elif req.goal == 'bulk': tdee += 500
    
    target_cals = round(tdee)

    # 2. Günlük Makro Hedefleri (%30 Pro, %45 Karb, %25 Yağ)
    target_p = (target_cals * 0.30) / 4
    target_c = (target_cals * 0.45) / 4
    target_f = (target_cals * 0.25) / 9

    # 3. Çiğ Değerlerle (Raw) Güncellenmiş Veritabanı
    db = {
        "proteins": {
            "Tavuk Göğsü": {"p": 31, "c": 0, "f": 3.6},
            "Hindi Göğsü": {"p": 29, "c": 0, "f": 1.5},
            "Yumurta": {"p": 13, "c": 1.1, "f": 11},
            "Lor Peyniri": {"p": 16, "c": 3, "f": 1},
            "Somon": {"p": 20, "c": 0, "f": 13},
            "Ton Balığı": {"p": 25, "c": 0, "f": 1},
            "Dana Eti": {"p": 26, "c": 0, "f": 15},
            "Yağsız Kıyma": {"p": 21, "c": 0, "f": 5},
            "Whey Protein": {"p": 80, "c": 5, "f": 2},
            "Tofu": {"p": 8, "c": 2, "f": 4}
        },
        "carbs": {
            "Yulaf": {"p": 13, "c": 68, "f": 6.5},
            "Basmati Pirinç": {"p": 8, "c": 78, "f": 1},
            "Kepekli Makarna": {"p": 13, "c": 65, "f": 2},
            "Tatlı Patates": {"p": 1.6, "c": 20, "f": 0.1},
            "Karabuğday": {"p": 13, "c": 71, "f": 3.4},
            "Kinoa": {"p": 14, "c": 64, "f": 6},
            "Bulgur": {"p": 12, "c": 76, "f": 1.3},
            "Yeşil Mercimek": {"p": 25, "c": 60, "f": 1},
            "Pirinç Patlağı": {"p": 8, "c": 80, "f": 3}
        },
        "fats": {
            "Zeytinyağı": {"p": 0, "c": 0, "f": 100},
            "Çiğ Badem": {"p": 21, "c": 22, "f": 49},
            "Ceviz": {"p": 15, "c": 14, "f": 65},
            "Fıstık Ezmesi": {"p": 25, "c": 20, "f": 50},
            "Avokado": {"p": 2, "c": 9, "f": 15},
            "Keten Tohumu": {"p": 18, "c": 29, "f": 42},
            "Chia Tohumu": {"p": 17, "c": 42, "f": 31}
        }
    }

    prompt = req.user_prompt.lower()
    
    pref_fats = list(db["fats"].keys())
    pref_carbs = list(db["carbs"].keys())
    pref_proteins = list(db["proteins"].keys())

    if "sadece zeytinyağı" in prompt or "hepsini zeytinyağı" in prompt: pref_fats = ["Zeytinyağı"]
    elif "kuruyemiş" in prompt: pref_fats = ["Ceviz", "Çiğ Badem", "Fıstık Ezmesi"]

    if "vegan" in prompt: pref_proteins = ["Tofu", "Whey Protein", "Yeşil Mercimek"]
    if "balık" in prompt and "sadece" in prompt: pref_proteins = ["Somon", "Ton Balığı"]
    
    if any(word in prompt for word in ["yulaf yemem", "yulaf yok"]): pref_carbs = [c for c in pref_carbs if c != "Yulaf"]
    if any(word in prompt for word in ["tavuk yemem", "tavuk yok"]): pref_proteins = [p for p in pref_proteins if p != "Tavuk Göğsü"]
    if any(word in prompt for word in ["kırmızı et yemem", "et yok"]): pref_proteins = [p for p in pref_proteins if p not in ["Dana Eti", "Yağsız Kıyma"]]

    # 4. GÜNLÜK PORSİYONLARI 2 ANA ÖĞÜNE BÖL (Çok yemeği önler)
    days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    diet_plan = {}
    
    for day in days:
        # Rastgele 2 farklı protein ve 2 farklı karb seç
        p_list = random.sample(pref_proteins, min(2, len(pref_proteins)))
        p1, p2 = p_list[0], p_list[-1]
        
        c_list = random.sample(pref_carbs, min(2, len(pref_carbs)))
        c1, c2 = c_list[0], c_list[-1]
        
        f1 = random.choice(pref_fats)
        
        # Günlük proteini ikiye böl (%60'ı birinden, %40'ı diğerinden)
        p1_grams = round(((target_p * 0.6) / db["proteins"][p1]["p"]) * 100 / 10) * 10
        p2_grams = round(((target_p * 0.4) / db["proteins"][p2]["p"]) * 100 / 10) * 10
        
        # Kalan Karbonhidratı hesapla ve böl
        rem_c = target_c - ((p1_grams/100) * db["proteins"][p1]["c"]) - ((p2_grams/100) * db["proteins"][p2]["c"])
        c1_grams = max(30, round(((rem_c * 0.6) / db["carbs"][c1]["c"]) * 100 / 10) * 10)
        c2_grams = max(30, round(((rem_c * 0.4) / db["carbs"][c2]["c"]) * 100 / 10) * 10)
        
        # Kalan Yağı hesapla
        rem_f = target_f - ((p1_grams/100) * db["proteins"][p1]["f"]) - ((p2_grams/100) * db["proteins"][p2]["f"]) - ((c1_grams/100) * db["carbs"][c1]["f"]) - ((c2_grams/100) * db["carbs"][c2]["f"])
        f1_grams = max(10, round((rem_f / db["fats"][f1]["f"]) * 100 / 5) * 5)
        
        diet_plan[day] = f"{p1}:{p1_grams}, {p2}:{p2_grams}, {c1}:{c1_grams}, {c2}:{c2_grams}, {f1}:{f1_grams}"

    return {
        "status": "success",
        "target_calories": target_cals,
        "ai_analysis": f"TDEE: {target_cals} kcal. Çoklu öğün sistemine göre 2 Protein + 2 Karb kaynağına bölündü.",
        "diet_plan": diet_plan
    }