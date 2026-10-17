# Mirror Mind no Windows — instalação em um vídeo

**Para quem:** quem vai instalar o Mirror num Windows pela primeira vez · **Duração alvo:** 2 min 30 s · **Formato:** o mesmo da demo e do treinamento da Luvia — narração sobre telas reais, capturadas numa instalação de verdade (Windows Sandbox, perfil `Helena`), player 1280×720, capítulos de 10 a 30 s.

**Ao final, a pessoa sabe:** o que o instalador faz e o que pede; que não precisa de senha de administrador; onde fica a memória; que precisa de uma chave da OpenRouter; como abrir o Mirror e conversar.

| # | Capítulo | Narração | Tela e estado | Ação animada |
|---|---|---|---|---|
| 1 | Abertura | "Este é o instalador do Mirror Mind para Windows. Um arquivo, alguns cliques, e o Mirror está pronto para conversar." | Cartão de abertura: octaedro, "Mirror Mind · instalação no Windows", versão | Cartão entra |
| 2 | O arquivo | "Você recebe um único arquivo: MirrorMind-Setup. Dois cliques nele. Não pede senha de administrador: ele instala só para o seu usuário." | Área de trabalho com o `.exe` | Cursor até o arquivo; dois cliques; onda |
| 3 | Boas-vindas | "A primeira tela explica o que vai acontecer: o instalador baixa e prepara o que o Mirror precisa, e no fim pergunta duas coisas. Leva uns cinco minutos e precisa de internet. Clique em «Instalar»." | 01-boas-vindas | Realce no texto; cursor até «Instalar»; clique |
| 4 | Instalando | "Agora é esperar. Ele instala o Node, o Git e o Pi, que é o terminal onde o Mirror conversa. Cada passo aparece na tela, com o tempo que levou. Nada para fazer aqui." | 03-instalando-meio → 04-instalando-fim (crossfade) | Realce na barra; realce no transcript rolando |
| 5 | Quase lá | "Terminou a parte pesada. Agora o Mirror quer saber quem é você. O nome que você escrever vira a sua pasta de memória, aqui neste computador. Nada é enviado para fora." | 05-quase-la | Realce no texto do meio; realce no campo «Como você quer ser chamado?» |
| 6 | A chave | "Para conversar, o Mirror usa um serviço de IA chamado OpenRouter. Uma conta serve para tudo. Se você ainda não tem, o botão «Criar conta e gerar chave» abre a página certa: crie a conta, coloque cinco dólares de crédito, gere uma chave e cole aqui. Ela começa com sk-or." | 05-quase-la | Realce no botão; realce no campo da chave (mascarada) |
| 7 | Configurando | "Clique em «Avançar». O Mirror confere a chave, cria a sua identidade, carrega as doze personas e se conecta ao Pi. Uns trinta segundos." | 06-configurando | Cursor até «Avançar»; clique; realce no transcript |
| 8 | Concluído | "Pronto. Deixe marcado «Iniciar o Mirror Mind» e clique em «Concluir». Daqui em diante, o atalho na área de trabalho abre o Mirror." | 07-concluido | Realce na caixa; cursor até «Concluir»; clique |
| 9 | O Mirror abre | "O Mirror abre numa janela de texto. O cartão mostra seu nome, a versão, e o que ele já sabe: uma jornada, doze personas, nenhuma memória ainda. Ela começa agora." | 08-mirror-abre | Realce no cartão `◇ Mirror · Helena` |
| 10 | A primeira conversa | "Converse como conversaria com alguém. Por exemplo, peça para ele listar as suas personas. Ele entende, consulta a memória e responde." | 09-pergunta → 11-resposta-final | Texto digitado; Enter; realce na lista |
| 11 | Em resumo | "Um arquivo, sem senha de administrador, cinco minutos. Seu nome e uma chave da OpenRouter. E o Mirror está pronto para conversar, com a memória guardada no seu computador." | Cartão de resumo: três frases | Frases acendem uma a uma |
| 12 | Fim | "Mirror Mind. Um espelho que conversa." | Cartão final: octaedro, versão, data | — |

**Rótulos a verificar nas telas:** «Instalar» · «Como você quer ser chamado?» · «Criar conta e gerar chave…» · «Avançar» · «Iniciar o Mirror Mind» · «Concluir» · `◇ Mirror · Helena`.

**Voz e estilo:** Thalita (edge-tts `pt-BR-ThalitaMultilingualNeural`, `-12%`, `-5Hz`), a mesma da Luvia. Segunda pessoa, frases curtas, tom calmo. A voz é multilingual e lê o inglês sozinha ("Mirror Mind", "OpenRouter", "Node", "Pi"); respelling forçado dava sotaque estranho. Só na fala: "MirrorMind-Setup" → "MirrorMind Setup", "sk-or" → "s k, hífen, o r". Evitar frases que também existem em espanhol ("listar minhas personas" virava espanhol): a fala pede, a tela mostra o comando.

**Privacidade na gravação:** o nome é fictício (`Helena`); a chave aparece mascarada na tela e só como rótulo (`sk-or-v1-fe0...e29`) no transcript — é a chave de desenvolvimento do Rodrigo, a ser rotacionada.

**Dados do ambiente:** Windows 11 (Sandbox), instalador `MirrorMind-Setup-2.0.0`, `mirror-mind@0.33.3`, Pi 1.3.0, Node 24.22.0.
