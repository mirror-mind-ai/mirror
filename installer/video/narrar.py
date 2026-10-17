# Narração dos capítulos do vídeo do instalador (modelo da Luvia: narrar.py).
#   uv run --with requests python installer/video/narrar.py installer/video/roteiro-pt.md .local/video/narracao [eleven|edge]
# Gera <pasta>/c<N>.mp3, <pasta>/timings.json e <pasta>/textos.json.
#
# Motor padrão: ElevenLabs, voz Matilda (pré-definida; funciona no plano gratuito),
# eleven_multilingual_v2 sem language_code: forçar pt fazia "Mirror" e "OpenRouter" soarem
# em português; com a detecção automática a voz lê os nomes em inglês. Escolhida em 17/10 depois do retorno
# "a voz ficou robótica" sobre a Thalita (edge-tts), que fica como alternativa.
# A chave vem de ELEVENLABS_API_KEY no ambiente ou de C:\VSCode\mirror\.env.
# Pronúncia só na fala; a legenda mantém a grafia do roteiro.
import json, os, re, subprocess, sys
from pathlib import Path

FFMPEG = r"C:\Users\rodri\AppData\Local\uv\cache\archive-v0\RNI7xNoJpeelYZzl\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
ELEVEN_VOICE = "XrExE9yKIg1WjnnlVkGX"   # Matilda - Knowledgable, Professional
ELEVEN_MODEL = "eleven_multilingual_v2"
ELEVEN_SETTINGS = {"stability": 0.5, "similarity_boost": 0.75, "style": 0.2, "use_speaker_boost": True}
EDGE_VOICE, EDGE_RATE, EDGE_PITCH = "pt-BR-ThalitaMultilingualNeural", "-12%", "-5Hz"

# The multilingual models read English names on their own; only what neither
# guesses gets help. The edge voice also needs the three product names respelled.
PRONUNCIA_COMUM = [
    (r"MirrorMind-Setup", "MirrorMind Setup"),
    (r"sk-or", "s k, hífen, o r"),
    (r"\bPi\b", "Pái"),   # both voices read "Pi" as the Portuguese letter otherwise
    (r"OpenRouter", "Ôpenrauter"),   # chosen by ear on 17/10 over seven spellings
    (r"«|»", ""), (r"·", ","), (r"…", ""), (r"—", ","),
]
PRONUNCIA_EDGE = [(r"\bNode\b", "Nôud"), (r"\bGit\b", "Guitt"), (r"Anthropic", "Antrópic")]


def para_fala(t: str, engine: str) -> str:
    for a, b in PRONUNCIA_COMUM + (PRONUNCIA_EDGE if engine == "edge" else []):
        t = re.sub(a, b, t)
    return re.sub(r"\s+", " ", t).strip()


def eleven_key() -> str:
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        env = Path(r"C:\VSCode\mirror\.env")
        m = re.search(r"^ELEVENLABS_API_KEY=(\S+)", env.read_text(encoding="utf-8"), re.M) if env.exists() else None
        k = m.group(1) if m else ""
    if not k:
        sys.exit("ELEVENLABS_API_KEY not set (environment or C:\\VSCode\\mirror\\.env)")
    return k


def sintetiza(texto: str, f: Path, engine: str):
    if engine == "eleven":
        import requests
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}",
                          headers={"xi-api-key": eleven_key(), "accept": "audio/mpeg"},
                          json={"text": texto, "model_id": ELEVEN_MODEL, "voice_settings": ELEVEN_SETTINGS}, timeout=180)
        if not r.ok:
            sys.exit(f"elevenlabs {r.status_code}: {r.text[:200]}")
        f.write_bytes(r.content)
    else:
        subprocess.run(["uv", "run", "--quiet", "--with", "edge-tts", "edge-tts", "--voice", EDGE_VOICE, f"--rate={EDGE_RATE}", f"--pitch={EDGE_PITCH}",
                        "--text", texto, "--write-media", str(f)], check=True)


md, pasta = Path(sys.argv[1]), Path(sys.argv[2])
engine = sys.argv[3] if len(sys.argv) > 3 else "eleven"
pasta.mkdir(parents=True, exist_ok=True)
timings, textos, chars = {}, {}, 0
for linha in md.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines():
    m = re.match(r"^\| (\d+) \| ([^|]+) \| (.+?) \| ", linha)
    if not m:
        continue
    n, texto = int(m.group(1)), m.group(3).strip()
    if texto.startswith('"') and texto.endswith('"'):
        texto = texto[1:-1]
    textos[n] = texto
    fala = para_fala(texto, engine)
    chars += len(fala)
    f = pasta / f"c{n}.mp3"
    sintetiza(fala, f, engine)
    info = subprocess.run([FFMPEG, "-i", str(f)], capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    timings[n] = round(int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)), 3)
(pasta / "timings.json").write_text(json.dumps(timings, indent=1), encoding="utf-8")
(pasta / "textos.json").write_text(json.dumps(textos, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"{md.name}: {len(timings)} capítulos, {sum(timings.values()):.0f}s de fala, {chars} caracteres ({engine})")
