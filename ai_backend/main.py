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

# React'tan gelecek verinin şeması
class WorkoutRequest(BaseModel):
    split_type: str
    user_prompt: str
    age: int
    goal: str
    weight: float

@app.post("/api/generate-ai-workout")
async def generate_ai_workout(req: WorkoutRequest):
    """
    BURASI YAPAY ZEKANIN KALBİDİR.
    İleride buraya TensorFlow, PyTorch veya OpenAI API (RAG ile Güray PDF'leri) entegre edilecek.
    Şu an kural tabanlı + temel makine öğrenmesi mantığı simüle edilmektedir.
    """
    
    # 1. Kullanıcının Notunu (Prompt) NLP ile Analiz Et
    prompt_lower = req.user_prompt.lower()
    rest_days = []
    days = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"]
    
    for day in days:
        if day in prompt_lower and any(word in prompt_lower for word in ["yok", "off", "dinlenme", "yapmicam"]):
            rest_days.append(day.capitalize())

    # 2. Yapay Zeka Modelinin Hacim (Volume) Kararı
    # Eğer bulk'taysa ve gençse, AI seti 4x10 yerine 5x8-12 (hipertrofi) önerecek.
    base_sets = "4x10"
    if req.goal == "bulk" and req.age < 30:
        base_sets = "4x8-12 (Tükeniş - RIR 0)"
    elif req.goal == "cut":
        base_sets = "3x10 (Kas koruma - RIR 1-2)"

    # 3. AI Egzersiz Seçimi (Burada Scikit-learn ile eğitilmiş bir model devreye girebilir)
    # Örnek Çıktı Üretimi:
    generated_plan = {}
    
    # PPL + Torso + Limbs Mantığı Dağıtımı
    split_logic = {
        "ppl_torso_limbs": ["Push", "Pull", "Legs", "Torso", "Limbs"]
    }
    
    active_days = [d.capitalize() for d in days if d.capitalize() not in rest_days]
    flow = split_logic.get(req.split_type, ["Full Body"])
    
    flow_idx = 0
    for day in days:
        cap_day = day.capitalize()
        if cap_day in rest_days:
            generated_plan[cap_day] = "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
        else:
            muscle = flow[flow_idx % len(flow)]
            
            # AI'nin kas grubuna göre moment prensibiyle hareket seçmesi
            if muscle == "Push":
                plan = f"1. Incline Dumbbell Press - {base_sets}\n2. Flat Bench Press - {base_sets}\n3. Cable Crossover - 3x15 (Failure)\n4. Lateral Raise - 4x15 (Beyond Failure)"
            elif muscle == "Torso":
                plan = f"1. Incline Barbell Press - {base_sets}\n2. T-Bar Row - {base_sets}\n3. Lat Pulldown - 4x10\n4. Machine Fly - 3x12"
            else:
                plan = f"--- {muscle.upper()} GÜNÜ ---\n(Yapay zeka tarafından hareketler buraya optimize edilir)"
                
            generated_plan[cap_day] = plan
            flow_idx += 1

    return {
        "status": "success",
        "message": "AI programı başarıyla oluşturdu.",
        "ai_analysis": f"Hedef: {req.goal}, Yaş: {req.age}. Dinlenme günleri algılandı: {rest_days}",
        "workout_plan": generated_plan
    }