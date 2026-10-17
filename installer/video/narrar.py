# Narração dos capítulos do vídeo do instalador (modelo da Luvia: narrar.py).
#   uv run python installer/video/narrar.py installer/video/roteiro-pt.md .local/video/narracao
# Gera <pasta>/c<N>.mp3 e <pasta>/timings.json. Voz Thalita, -12%, -5Hz; a
# pronúncia é aplicada só na fala (a legenda mantém a grafia do roteiro).
import json, re, subprocess, sys
from pathlib import Path

FFMPEG = r"C:\Users\rodri\AppData\Local\uv\cache\archive-v0\RNI7xNoJpeelYZzl\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
VOZ, RATE, PITCH = "pt-BR-ThalitaMultilingualNeural", "-12%", "-5Hz"

PRONUNCIA = [
    (r"MirrorMind-Setup", "Mírror Máind Sétap"),
    (r"Mirror Mind", "Mírror Máind"),
    (r"\bMirror\b", "Mírror"),
    (r"OpenRouter", "Ôpen Ráuter"),
    (r"\bPi\b", "Pái"),
    (r"\bNode\b", "Nôud"),
    (r"\bGit\b", "Guít"),
    (r"sk-or", "ésse cá, ífen, ó érre"),
    (r"«|»", ""), (r"·", ","), (r"…", ""), (r"—", ","),
]

def para_fala(t: str) -> str:
    for a, b in PRONUNCIA:
        t = re.sub(a, b, t)
    return re.sub(r"\s+", " ", t).strip()

md, pasta = Path(sys.argv[1]), Path(sys.argv[2])
pasta.mkdir(parents=True, exist_ok=True)
timings, textos = {}, {}
for linha in md.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines():
    m = re.match(r"^\| (\d+) \| ([^|]+) \| (.+?) \| ", linha)
    if not m:
        continue
    n, texto = int(m.group(1)), m.group(3).strip()
    if texto.startswith('"') and texto.endswith('"'):
        texto = texto[1:-1]
    textos[n] = texto
    f = pasta / f"c{n}.mp3"
    subprocess.run(["uv", "run", "--quiet", "--with", "edge-tts", "edge-tts", "--voice", VOZ, f"--rate={RATE}", f"--pitch={PITCH}",
                    "--text", para_fala(texto), "--write-media", str(f)], check=True)
    info = subprocess.run([FFMPEG, "-i", str(f)], capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    timings[n] = round(int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)), 3)
(pasta / "timings.json").write_text(json.dumps(timings, indent=1), encoding="utf-8")
(pasta / "textos.json").write_text(json.dumps(textos, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"{md.name}: {len(timings)} capítulos, {sum(timings.values()):.0f}s de fala")
