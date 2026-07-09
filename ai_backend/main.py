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

    # 2. Vücut Geliştirme Makro Matematiği
    target_p = req.weight_kg * 2.2
    target_f = (target_cals * 0.25) / 9 
    target_c = (target_cals - (target_p * 4) - (target_f * 9)) / 4 

    # 3. Çiğ Değerlerle Güncellenmiş Türk Damak Tadı Veritabanı
    db = {
        "proteins": {
            "Tavuk Göğsü": {"p": 31, "c": 0, "f": 3.6},
            "Hindi Göğsü": {"p": 29, "c": 0, "f": 1.5},
            "Yumurta": {"p": 13, "c": 1.1, "f": 11},
            "Lor Peyniri": {"p": 16, "c": 3, "f": 1},
            "Somon": {"p": 20, "c": 0, "f": 13},
            "Dana Eti": {"p": 26, "c": 0, "f": 15},
            "Yağsız Kıyma": {"p": 21, "c": 0, "f": 5},
            "Whey Protein": {"p": 80, "c": 5, "f": 2}
            # Tofu Türkiye'de zor bulunduğu için sistemden çıkarıldı
        },
        "carbs": {
            "Yulaf": {"p": 13, "c": 68, "f": 6.5},
            "Basmati Pirinç": {"p": 8, "c": 78, "f": 1},
            "Baldo Pirinç": {"p": 7, "c": 79, "f": 1},      # YENİ
            "Yasemin Pirinç": {"p": 7, "c": 80, "f": 0.5},  # YENİ
            "Kepekli Makarna": {"p": 13, "c": 65, "f": 2},
            "Tatlı Patates": {"p": 1.6, "c": 20, "f": 0.1},
            "Karabuğday": {"p": 13, "c": 71, "f": 3.4},
            "Kinoa": {"p": 14, "c": 64, "f": 6},
            "Yeşil Mercimek": {"p": 25, "c": 60, "f": 1}
        },
        "fats": {
            "Zeytinyağı": {"p": 0, "c": 0, "f": 100},
            "Çiğ Badem": {"p": 21, "c": 22, "f": 49},
            "Ceviz": {"p": 15, "c": 14, "f": 65},
            "Fıstık Ezmesi": {"p": 25, "c": 20, "f": 50},
            "Avokado": {"p": 2, "c": 9, "f": 15}
        }
    }

    prompt = req.user_prompt.lower()
    
    pref_fats = list(db["fats"].keys())
    pref_carbs = list(db["carbs"].keys())
    pref_proteins = list(db["proteins"].keys())

    # --- NLP: İstekler ve Tercihler ---
    if "sadece zeytinyağı" in prompt or "hepsini zeytinyağı" in prompt: pref_fats = ["Zeytinyağı"]
    elif "kuruyemiş" in prompt: pref_fats = ["Ceviz", "Çiğ Badem", "Fıstık Ezmesi"]

    if any(word in prompt for word in ["yulaf yemem", "yulaf yok"]): pref_carbs = [c for c in pref_carbs if c != "Yulaf"]
    if any(word in prompt for word in ["tavuk yemem", "tavuk yok"]): pref_proteins = [p for p in pref_proteins if p != "Tavuk Göğsü"]
    
    # 🤖 YENİ NLP: Tek Çeşit Protein (Bölme) İsteği
    split_proteins = True
    if any(word in prompt for word in ["bölme", "tek çeşit", "günde tek", "tek protein", "aynı protein"]):
        split_proteins = False
    
    # 4. GÜNLÜK PORSİYONLAR VE BÖLÜNMELER
    days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    diet_plan = {}
    
    for day in days:
        # Eğer kullanıcı "bölme" dediyse, o gün için tek bir protein kaynağı seçip onu 4 öğüne kopyalıyoruz
        if split_proteins:
            p_list = random.choices(pref_proteins, k=4)
        else:
            single_p = random.choice(pref_proteins)
            p_list = [single_p] * 4 

        c_list = random.choices(pref_carbs, k=4)
        f_list = random.choices(pref_fats, k=2)
        
        daily_foods = {}
        
        for p in p_list:
            meal_p = target_p / 4
            grams = max(50, round((meal_p / db["proteins"][p]["p"]) * 100 / 10) * 10)
            
            # Sınırlar (Mide dostu)
            if split_proteins:
                if p == "Yumurta" and grams > 150: grams = 150 
                if p == "Lor Peyniri" and grams > 100: grams = 100 
            else:
                # Kullanıcı tek çeşit istediyse sınırları biraz esnetiyoruz ki proteine ulaşabilsin
                if p == "Yumurta" and grams > 200: grams = 200 
                if p == "Lor Peyniri" and grams > 200: grams = 200 
            
            daily_foods[p] = daily_foods.get(p, 0) + grams
            
        for c in c_list:
            meal_c = target_c / 4
            grams = max(40, round((meal_c / db["carbs"][c]["c"]) * 100 / 10) * 10)
            if c in ["Yulaf", "Kinoa", "Karabuğday"] and grams > 80: grams = 80
            daily_foods[c] = daily_foods.get(c, 0) + grams
            
        trace_f = sum((grams/100) * db["proteins"][p]["f"] for p, grams in daily_foods.items() if p in db["proteins"]) + \
                  sum((grams/100) * db["carbs"][c]["f"] for c, grams in daily_foods.items() if c in db["carbs"])
        
        rem_f = max(10, target_f - trace_f)
        
        for f in f_list:
            meal_f = rem_f / 2
            grams = max(10, round((meal_f / db["fats"][f]["f"]) * 100 / 5) * 5)
            if f in ["Çiğ Badem", "Ceviz", "Fıstık Ezmesi"] and grams > 30: grams = 30 
            daily_foods[f] = daily_foods.get(f, 0) + grams

        total_f_added = sum((grams/100) * db["fats"][f]["f"] for f, grams in daily_foods.items() if f in db["fats"])
        if rem_f - total_f_added > 10:
            extra_oil = round((rem_f - total_f_added) / db["fats"]["Zeytinyağı"]["f"] * 100 / 5) * 5
            daily_foods["Zeytinyağı"] = daily_foods.get("Zeytinyağı", 0) + extra_oil

        final_strings = []
        for name, grams in daily_foods.items():
            if name == "Yumurta":
                adet = int(grams / 50)
                final_strings.append(f"Yumurta:{grams} ({adet} Adet)")
            else:
                final_strings.append(f"{name}:{grams}")

        diet_plan[day] = ", ".join(final_strings)

    analysis_msg = f"TDEE: {target_cals} kcal."
    if not split_proteins:
        analysis_msg += " 'Tek çeşit protein' isteği uygulandı."

    return {
        "status": "success",
        "target_calories": target_cals,
        "ai_analysis": analysis_msg,
        "diet_plan": diet_plan
    }