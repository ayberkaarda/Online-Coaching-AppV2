# Türkçe glif kabul testi (Kor & Kemik §4, aşama 1 — cmap).
# `next build` sonrası `.next/static/media` altında Next'in ürettiği woff2 dosyalarında
# her aile/ağırlık için İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü bulunmasını ve `tnum` özelliğini denetler.
# Eksik glifte çıkış kodu 1'dir. Çalıştırma: `python scripts/check-font-glyphs.py`
# (gerekli: fontTools + brotli). Yol bu dosyanın konumuna göre çözülür.
import re, sys, pathlib, collections
from fontTools.ttLib import TTFont

NEXT = pathlib.Path(__file__).resolve().parent.parent / '.next'
REQ = [0x130, 0x131, 0x15E, 0x15F, 0x11E, 0x11F, 0xC7, 0xE7, 0xD6, 0xF6, 0xDC, 0xFC]
css = ''
for p in (NEXT / 'static').rglob('*.css'):
    css += p.read_text(encoding='utf-8', errors='ignore')
faces = re.findall(r'@font-face\{([^}]*)\}', css)
groups = collections.defaultdict(list)
for f in faces:
    fam = re.search(r"font-family:\s*['\"]?([^;'\"]+)", f).group(1)
    if 'Fallback' in fam:
        continue
    w = re.search(r'font-weight:\s*(\d+)', f).group(1)
    url = re.search(r'url\(([^)]+)\)', f).group(1).strip('\'"')
    groups[(fam, w)].append(url)
ok = bool(groups)
if not groups:
    print('HATA: Kontrol edilecek font bulunamadı.', file=sys.stderr)
for (fam, w), urls in sorted(groups.items()):
    cmap = set()
    feats = set()
    for u in urls:
        path = NEXT / u.split('/_next/')[-1]
        if not path.is_file():
            print(f'HATA: Font bulunamadı: {path}', file=sys.stderr)
            ok = False
            continue
        font = TTFont(str(path))
        cmap |= set(font.getBestCmap().keys())
        if 'GSUB' in font and font['GSUB'].table.FeatureList:
            feats |= {fr.FeatureTag for fr in font['GSUB'].table.FeatureList.FeatureRecord}
    missing = [f'U+{c:04X}' for c in REQ if c not in cmap]
    tnum = 'tnum' in feats
    # JetBrains Mono zaten eş aralıklıdır; bu ailede tnum beklenmez.
    requires_tnum = 'jetbrainsmono' not in re.sub(r'[^a-z]', '', fam.lower())
    status = 'OK' if not missing else 'EKSIK ' + ','.join(missing)
    if missing or (requires_tnum and not tnum):
        ok = False
    print(f'{fam:40s} {w}  dosya={len(urls)}  turkce={status}  tnum={"var" if tnum else "yok"}')
sys.exit(0 if ok else 1)
