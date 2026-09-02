# Testar o instalador do Mirror no Windows Sandbox

O produto deste projeto é um **pacote de instalação**: Frame + onboarding
inicial + Pi + Mirror, com tudo necessário para rodar no Windows — evolução do
instalador oficial (release v0.30.0+). Este kit testa exatamente a experiência
do usuário final: baixar o setup e rodar numa máquina limpa.

## Pré-requisitos (host)
- Windows 10/11 **Pro/Enterprise** com *Windows Sandbox* habilitado.
- O instalador compilado em `dist\MirrorMind-Setup-<versão>.exe`
  (gerado por `installer\build.ps1 -Version <versão>`; o frame precisa estar
  empacotado antes em `frame\out\MirrorFrame-win32-x64\`).

## Como rodar
1. Duplo clique em **`mirror-setup-test.wsb`** — o sandbox abre com o
   instalador copiado para a área de trabalho.
2. Duplo clique em **`MirrorMind-Setup-<versão>.exe`** e siga o assistente,
   como um usuário faria.

## Roteiro de teste (o que esperar)
1. **Assistente Inno** em PT-BR: coleta seu nome e a chave OpenRouter
   (pode pular a chave para testar sem memória).
2. **Bootstrap** dentro do instalador: baixa Git, Node, uv e Pi
   (sem winget no sandbox → downloads diretos, ~5–10 min) e clona o Mirror.
3. Ao final, o atalho **"Mirror Mind"** (menu Iniciar/desktop) abre o **frame**:
   - Se o assistente coletou seu nome, o frame **pula o onboarding** (o `.env`
     já existe) e vai direto ao warm-up → sessões liberadas.
   - Se você pulou a coleta, o frame mostra o **wizard de 1º acesso** próprio.
4. Dentro do frame: abas com **sessões Pi reais** (para conversar: `/login` —
   sandbox é efêmero, a credencial morre ao fechar), painel **◇ Personas**
   (identity list + detect-persona reais) e **⚙ Setup** com semáforos e updates
   gated (regra R2: nunca com sessão aberta).
5. Atalho **"Mirror Mind (Terminal)"** preserva a rota terminal-pura
   (`mirror.cmd`), como no instalador original.

## Limites conhecidos
- Sandbox é descartável: instalação, logins e banco evaporam ao fechar.
- Sem assinatura conectada o Pi abre mas não conversa — a UX do instalador,
  do frame e dos gates é testável mesmo assim.
- O setup não é assinado (SmartScreen avisa "editor desconhecido" — Executar
  assim mesmo).
