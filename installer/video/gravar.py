# Grava o vídeo do instalador a partir dos frames reais (Sandbox) e da narração.
#   uv run --with "playwright==1.63.0" python installer/video/gravar.py   (1.63 = chromium-1243, already cached)
# Entrada: .local/video/frames/*.png (demo-capture.ps1), .local/video/narracao/ (narrar.py)
# Saída:   .local/video/out/mirror-instalador-windows.mp4 + .vtt + -capitulos.json
# Mesma mecânica do treinamento da Luvia: player HTML 1280x720, cursor e realces
# animados, captura por CDP screencast alinhada ao instante zero, mux no ffmpeg.
import base64, json, subprocess, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(r"C:\VSCode\mirror-installer")
FRAMES, NARR, OUT = RAIZ / ".local/video/frames", RAIZ / ".local/video/narracao", RAIZ / ".local/video/out"
ICONE = RAIZ / "installer/assets/mirror-256.png"
ROTEIRO = RAIZ / "installer/video/roteiro-pt.md"
FFMPEG = r"C:\Users\rodri\AppData\Local\uv\cache\archive-v0\RNI7xNoJpeelYZzl\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
RESPIRO, INTRO, OUTRO = 0.9, 1.0, 2.0
VERSAO = "MirrorMind-Setup 2.0.0 · mirror-mind 0.33.4 · Pi 1.3.0"

# Cenas na ordem do roteiro. rect = [x, y, w, h] em pixels do frame.
CENAS = [
    {"n": 1, "tipo": "card", "k": "Mirror Mind", "h1": "Instalação no Windows", "ps": ["Um arquivo. Alguns cliques. Pronto para conversar."]},
    {"n": 2, "tipo": "arquivo", "acoes": [{"t": 0.45, "tipo": "cursor", "para": [640, 330]}, {"t": 0.7, "tipo": "clique", "para": [640, 330]}, {"t": 0.78, "tipo": "clique", "para": [640, 330]}]},
    {"n": 3, "tipo": "tela", "tela": "01-boas-vindas.png", "acoes": [
        {"t": 0.08, "tipo": "realce", "rect": [236, 144, 252, 192]},
        {"t": 0.72, "tipo": "cursor", "rect": [337, 467, 72, 22]}, {"t": 0.9, "tipo": "clique", "rect": [337, 467, 72, 22]}]},
    {"n": 4, "tipo": "tela", "tela": "03-instalando-meio.png", "acoes": [
        {"t": 0.1, "tipo": "realce", "rect": [46, 144, 420, 24]},
        {"t": 0.45, "tipo": "realce", "rect": [46, 174, 420, 270]}]},
    {"n": 5, "tipo": "tela", "tela": "05-quase-la.png", "acoes": [
        {"t": 0.1, "tipo": "realce", "rect": [46, 222, 422, 40]},
        {"t": 0.6, "tipo": "realce", "rect": [46, 348, 422, 58]}]},
    {"n": 6, "tipo": "tela", "tela": "05-quase-la.png", "acoes": [
        {"t": 0.3, "tipo": "realce", "rect": [300, 424, 166, 26]},
        {"t": 0.75, "tipo": "realce", "rect": [46, 410, 252, 40]}]},
    {"n": 7, "tipo": "tela", "tela": "05-quase-la.png", "depois": "06-configurando.png", "acoes": [
        {"t": 0.05, "tipo": "cursor", "rect": [337, 467, 72, 22]}, {"t": 0.2, "tipo": "clique", "rect": [337, 467, 72, 22]},
        {"t": 0.22, "tipo": "troca"}, {"t": 0.35, "tipo": "realce", "rect": [46, 176, 420, 180]}]},
    {"n": 8, "tipo": "tela", "tela": "07b-concluido.png", "acoes": [
        {"t": 0.15, "tipo": "realce", "rect": [240, 355, 136, 22]},
        {"t": 0.65, "tipo": "cursor", "rect": [337, 467, 72, 22]}, {"t": 0.85, "tipo": "clique", "rect": [337, 467, 72, 22]}]},
    {"n": 9, "tipo": "tela", "tela": "08-mirror-abre.png", "acoes": [{"t": 0.25, "tipo": "realce", "rect": [8, 368, 600, 80]}]},
    {"n": 10, "tipo": "tela", "tela": "09-pergunta.png", "depois": "11-resposta-final.png", "acoes": [
        {"t": 0.05, "tipo": "realce", "rect": [8, 590, 1070, 22]}, {"t": 0.4, "tipo": "troca"}, {"t": 0.5, "tipo": "realce", "rect": [8, 300, 540, 262]}]},
    {"n": 11, "tipo": "card", "k": "Em resumo", "h1": "", "ps": ["Um arquivo, sem senha de administrador, cinco minutos.", "Seu nome e uma chave da OpenRouter.", "Memória guardada no seu computador."]},
    {"n": 12, "tipo": "card", "k": "", "h1": "Mirror Mind", "ps": ["Um espelho que conversa."]},
]

PLAYER = r"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
 html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:radial-gradient(120% 120% at 20% 0%,#2a1a5e 0%,#1b1140 55%,#120b2c 100%);font-family:"Segoe UI",system-ui,sans-serif;color:#f6f2ea}
 #topo{position:absolute;left:40px;right:40px;top:16px;height:30px;display:flex;align-items:center;gap:12px;font-size:13px}
 #topo img{height:22px} #topo .mod{color:#d9cdf5;font-weight:600;letter-spacing:.01em}
 #cap{margin-left:auto;background:#ffffff14;border:1px solid #ffffff22;border-radius:999px;padding:4px 12px;color:#e8e0fa;font-size:12px;transition:opacity .3s}
 #selo{font-size:11px;color:#b9a9e6;background:#ffffff0d;border-radius:999px;padding:4px 10px}
 #palco{position:absolute;left:40px;top:58px;width:1200px;height:640px}
 .cena{position:absolute;inset:0;opacity:0;transition:opacity .45s ease}
 .cena.on{opacity:1}
 .janela{position:absolute;box-shadow:0 24px 60px #00000080,0 2px 8px #00000066;border-radius:10px;overflow:hidden}
 .janela img{position:absolute;left:0;top:0;transition:opacity .4s ease}
 #cursor{position:absolute;left:0;top:0;width:26px;height:26px;z-index:50;opacity:0;transition:left .55s cubic-bezier(.3,.8,.3,1),top .55s cubic-bezier(.3,.8,.3,1),opacity .3s;pointer-events:none;filter:drop-shadow(0 2px 3px #0008)}
 #realce{position:absolute;z-index:40;border:3px solid #f0c460;border-radius:8px;box-shadow:0 0 0 6px #f0c46044;opacity:0;transition:all .55s cubic-bezier(.3,.8,.3,1);pointer-events:none}
 .onda{position:absolute;z-index:45;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #f0c460;animation:onda .7s ease-out forwards;pointer-events:none}
 @keyframes onda{to{transform:scale(3.4);opacity:0}}
 .cartao{position:absolute;inset:40px 120px;display:flex;flex-direction:column;justify-content:center}
 .cartao .k{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#a884e8;font-weight:600}
 .cartao h1{font-weight:600;font-size:50px;line-height:1.12;margin:14px 0 22px;color:#f6f2ea}
 .cartao p{font-size:24px;line-height:1.45;margin:8px 0;color:#d9cdf5;opacity:0;transform:translateY(8px);transition:all .6s ease}
 .cartao p.on{opacity:1;transform:none}
 .cartao p::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#f0c460;margin:0 14px 3px 0}
 .cartao img.icone{width:120px;height:120px;margin-bottom:10px}
 .arquivo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
 .arquivo .ico{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 34px;border-radius:14px;background:#ffffff0a;border:1px solid #ffffff18}
 .arquivo img{width:128px;height:128px}
 .arquivo span{font-size:16px;color:#f6f2ea}
</style></head><body>
<div id="topo"><img src="__ICONE__" alt=""><span class="mod">Mirror Mind · instalação no Windows</span><span id="cap"></span><span id="selo">__VERSAO__</span></div>
<div id="palco"></div>
<svg id="cursor" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" fill="#fff" stroke="#1b1140" stroke-width="1.6" stroke-linejoin="round"/></svg>
<div id="realce"></div>
<script>
const CENAS=__CENAS__, TEMPOS=__TEMPOS__, INTRO=__INTRO__, OUTRO=__OUTRO__, LEG=__LEGENDAS__;
const palco=document.getElementById('palco'), cursor=document.getElementById('cursor'), realce=document.getElementById('realce'), cap=document.getElementById('cap');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fit(w,h){const k=Math.min(1200/w,640/h,1.25);const W=Math.round(w*k),H=Math.round(h*k);return {k,W,H,x:Math.round((1200-W)/2),y:Math.round((640-H)/2)}}
const geo={};
for(const c of CENAS){
  const el=document.createElement('div');el.className='cena';el.id='c'+c.n;
  if(c.tipo==='card'){el.innerHTML=`<div class="cartao">${c.n===12?'<img class="icone" src="__ICONE__">':''}${c.k?`<div class="k">${c.k}</div>`:''}${c.h1?`<h1>${c.h1}</h1>`:''}${c.ps.map(p=>`<p>${p}</p>`).join('')}</div>`;}
  else if(c.tipo==='arquivo'){el.innerHTML=`<div class="arquivo"><div class="ico"><img src="__ICONE__"><span>MirrorMind-Setup-2.0.0.exe</span></div></div>`;}
  else{const im=new Image();im.src=c.tela;el.dataset.pendente='1';
    el.innerHTML=`<div class="janela"><img class="a" src="${c.tela}">${c.depois?`<img class="b" src="${c.depois}" style="opacity:0">`:''}</div>`;}
  palco.appendChild(el);
}
async function prontos(){
  const imgs=[...document.querySelectorAll('.janela img')];
  await Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=r;i.onerror=r})));
  for(const c of CENAS){ if(c.tipo!=='tela') continue; const el=document.getElementById('c'+c.n); const a=el.querySelector('img.a');
    const g=fit(a.naturalWidth,a.naturalHeight); geo[c.n]=g; const j=el.querySelector('.janela');
    j.style.left=g.x+'px';j.style.top=g.y+'px';j.style.width=g.W+'px';j.style.height=g.H+'px';
    for(const i of el.querySelectorAll('img')){i.style.width=g.W+'px';i.style.height=g.H+'px';}
  }
  window.__pronto=true;
}
function map(c,rect){const g=geo[c.n];return {x:40+g.x+rect[0]*g.k,y:58+g.y+rect[1]*g.k,w:rect[2]*g.k,h:rect[3]*g.k}}
function ponto(c,a){ if(a.para) return {x:40+a.para[0],y:58+a.para[1]}; const r=map(c,a.rect); return {x:r.x+r.w/2,y:r.y+r.h/2}; }
function showRealce(c,rect){const r=map(c,rect);realce.style.left=(r.x-6)+'px';realce.style.top=(r.y-6)+'px';realce.style.width=(r.w+12)+'px';realce.style.height=(r.h+12)+'px';realce.style.opacity=1;}
function hideRealce(){realce.style.opacity=0}
function moveCursor(p){cursor.style.opacity=1;cursor.style.left=(p.x-4)+'px';cursor.style.top=(p.y-2)+'px';}
function onda(p){const o=document.createElement('div');o.className='onda';o.style.left=p.x+'px';o.style.top=p.y+'px';document.body.appendChild(o);setTimeout(()=>o.remove(),800);}
async function cena(c,tm){
  const el=document.getElementById('c'+c.n); cap.textContent=LEG[c.n]||''; el.classList.add('on');
  if(c.tipo==='card'){ const ps=el.querySelectorAll('p'); ps.forEach((p,i)=>setTimeout(()=>p.classList.add('on'),400+i*Math.min(1800,(tm.dur*1000-1200)/Math.max(1,ps.length)))); }
  const acoes=(c.acoes||[]).map(a=>({...a,at:a.t*tm.dur*1000}));
  const t0=performance.now();
  for(const a of acoes){ const wait=a.at-(performance.now()-t0); if(wait>0) await sleep(wait);
    if(a.tipo==='realce') showRealce(c,a.rect);
    else if(a.tipo==='cursor'){hideRealce();moveCursor(ponto(c,a));}
    else if(a.tipo==='clique'){const p=ponto(c,a);moveCursor(p);onda(p);}
    else if(a.tipo==='troca'){hideRealce();cursor.style.opacity=0;const b=el.querySelector('img.b');if(b)b.style.opacity=1;}
  }
  const rest=tm.dur*1000-(performance.now()-t0); if(rest>0) await sleep(rest);
  hideRealce(); cursor.style.opacity=0; el.classList.remove('on');
}
window.__go=async()=>{ await sleep(INTRO*1000); for(let i=0;i<CENAS.length;i++) await cena(CENAS[i],TEMPOS[i]); cap.textContent=''; await sleep(OUTRO*1000); window.__done=true; };
prontos();
</script></body></html>"""


def main():
    falas = json.loads((NARR / "timings.json").read_text(encoding="utf-8"))
    legendas = json.loads((NARR / "textos.json").read_text(encoding="utf-8"))
    tempos, t = [], 0.0
    for c in CENAS:
        fala = falas[str(c["n"])]
        dur = max(fala + RESPIRO, 4.5 if c.get("depois") else 3.0)
        tempos.append({"ini": round(t, 3), "dur": round(dur, 3), "fala": fala})
        t += dur
    total = INTRO + t + OUTRO
    html = (PLAYER.replace("__CENAS__", json.dumps(CENAS, ensure_ascii=False)).replace("__TEMPOS__", json.dumps(tempos))
            .replace("__LEGENDAS__", json.dumps({int(k): v for k, v in legendas.items()}, ensure_ascii=False))
            .replace("__INTRO__", str(INTRO)).replace("__OUTRO__", str(OUTRO)).replace("__VERSAO__", VERSAO)
            .replace("__ICONE__", ICONE.as_uri()))
    (FRAMES / "player.html").write_text(html, encoding="utf-8")

    tmp = Path(tempfile.mkdtemp(prefix="mirror-video-"))
    quadros = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-gpu-vsync"])
        pg = b.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5)
        pg.goto((FRAMES / "player.html").as_uri(), wait_until="load")
        pg.wait_for_function("window.__pronto === true", timeout=60000)
        cdp = pg.context.new_cdp_session(pg)

        def ao_quadro(ev):
            f = tmp / f"q{len(quadros):06d}.jpg"
            f.write_bytes(base64.b64decode(ev["data"]))
            quadros.append((ev["metadata"]["timestamp"], f))
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

        cdp.on("Page.screencastFrame", ao_quadro)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 90, "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})
        pg.wait_for_timeout(600)
        t_go = time.time()
        pg.evaluate("window.__go()")
        pg.wait_for_function("window.__done === true", timeout=int((total + 60) * 1000), polling=250)
        pg.wait_for_timeout(500)
        cdp.send("Page.stopScreencast")
        b.close()

    qs = [(ts - t_go, f) for ts, f in quadros]
    antes = [q for q in qs if q[0] <= 0]
    seq = ([(0.0, antes[-1][1])] if antes else []) + [q for q in qs if 0 < q[0] <= total]
    linhas = [f"file '{f.as_posix()}'\nduration {max(0.001, prox[0] - t0):.4f}" for (t0, f), prox in zip(seq, seq[1:] + [(total, None)])]
    linhas.append(f"file '{seq[-1][1].as_posix()}'")
    (tmp / "lista.txt").write_text("ffconcat version 1.0\n" + "\n".join(linhas) + "\n", encoding="utf-8")

    entradas, filtros = ["-f", "lavfi", "-t", str(INTRO), "-i", "anullsrc=r=48000:cl=mono"], ["[0:a]anull[a0]"]
    for i, (c, tm) in enumerate(zip(CENAS, tempos), start=1):
        entradas += ["-i", str(NARR / f"c{c['n']}.mp3")]
        filtros.append(f"[{i}:a]aresample=48000,apad=whole_dur={tm['dur']}[a{i}]")
    n = len(tempos) + 1
    entradas += ["-f", "lavfi", "-t", str(OUTRO), "-i", "anullsrc=r=48000:cl=mono"]
    filtros.append(f"[{n}:a]anull[a{n}]")
    filtros.append("".join(f"[a{i}]" for i in range(n + 1)) + f"concat=n={n + 1}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
    narr = tmp / "narracao.m4a"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(filtros), "-map", "[aout]", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", str(narr)], check=True)

    OUT.mkdir(parents=True, exist_ok=True)
    saida = OUT / "mirror-instalador-windows.mp4"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "lista.txt"), "-i", str(narr),
                    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(saida)], check=True)

    def ts(s):
        return f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{s % 60:06.3f}"
    vtt = ["WEBVTT", ""]
    for i, (c, tm) in enumerate(zip(CENAS, tempos), start=1):
        ini = INTRO + tm["ini"]
        vtt += [str(i), f"{ts(ini)} --> {ts(ini + tm['fala'])}", legendas[str(c["n"])], ""]
    (OUT / "mirror-instalador-windows.vtt").write_text("\n".join(vtt), encoding="utf-8")
    caps = [{"n": c["n"], "inicio": round(INTRO + tm["ini"], 2)} for c, tm in zip(CENAS, tempos)]
    (OUT / "mirror-instalador-windows-capitulos.json").write_text(json.dumps({"versao": VERSAO, "duracao": round(total, 1), "capitulos": caps}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{total / 60:.1f} min · {len(seq)} quadros ({len(seq) / total:.0f} fps) · {saida}")


if __name__ == "__main__":
    main()
