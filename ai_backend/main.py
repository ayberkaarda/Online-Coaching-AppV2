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
    # 1. BMR ve TDEE Hesaplaması (Mifflin-St Jeor Formülü)
    bmr = (10 * req.weight_kg) + (6.25 * req.height_cm) - (5 * req.age)
    bmr += 5 if req.gender == 'male' else -161

    # Adım Sayısına Göre Aktivite Çarpanı
    if req.steps < 5000: multiplier = 1.2
    elif req.steps < 8000: multiplier = 1.375
    elif req.steps < 10000: multiplier = 1.55
    elif req.steps < 12000: multiplier = 1.725
    else: multiplier = 1.9

    tdee = bmr * multiplier

    # Hedefe Göre Kalori Modifikasyonu
    if req.goal == 'cut': tdee -= 500
    elif req.goal == 'bulk': tdee += 500
    
    target_cals = round(tdee)

    # 2. NLP: Kullanıcı İsteklerini Çözümleme
    prompt = req.user_prompt.lower()
    
    fat_sources = ["Zeytinyağı:15"]
    carb_sources = ["Yulaf:100", "Pirinç:100", "Makarna:100", "Tatlı Patates:150", "Karabuğday:100"]
    protein_sources = ["Tavuk Göğsü:200", "Yumurta:150", "Lor Peyniri:150", "Somon:150", "Dana Eti:150"]

    if "sadece zeytinyağı" in prompt or "hepsini zeytinyağı" in prompt:
        fat_sources = ["Zeytinyağı:30"]
    elif "zeytinyağı" in prompt and "kuruyemiş" in prompt:
        fat_sources = ["Zeytinyağı:15, Çiğ Badem:20", "Zeytinyağı:15, Ceviz:20"]
    elif "kuruyemiş" in prompt:
        fat_sources = ["Ceviz:30", "Çiğ Badem:30", "Fıstık Ezmesi:30"]

    if "yulaf" in prompt and any(word in prompt for word in ["yemem", "yok", "sevmiyorum", "alerji"]):
        carb_sources = [c for c in carb_sources if "Yulaf" not in c]
    if "tavuk" in prompt and any(word in prompt for word in ["yemem", "yok", "sevmiyorum", "alerji"]):
        protein_sources = [p for p in protein_sources if "Tavuk" not in p]

    # 3. Haftalık Planı Oluşturma
    days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    diet_plan = {}
    
    for day in days:
        p = random.choice(protein_sources)
        c = random.choice(carb_sources)
        f = random.choice(fat_sources)
        diet_plan[day] = f"{p}, {c}, {f}"

    return {
        "status": "success",
        "target_calories": target_cals,
        "ai_analysis": f"Hesaplanan TDEE: {target_cals}. Hariç tutulanlar ve tercihler işlendi.",
        "diet_plan": diet_plan
    }