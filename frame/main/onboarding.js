"use strict";
// Lógica pura do estado da chave OpenRouter no onboarding (review do PR #32,
// item 2). Sem framework de wizard — só as decisões testáveis.
//
// UMD: o MESMO arquivo é a unidade testada (require, node --test) e o módulo
// usado pelo renderer (global window.MirrorOnboarding via <script>), para que
// a lógica coberta por testes seja exatamente a executada — sem duplicação.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MirrorOnboarding = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Estado inicial do "keySaved" ao ENTRAR no wizard: reflete o .env real. No
  // retry/restart após falha de init/seed, o marcador MIRROR_USER foi revertido
  // mas a chave já gravada permanece — então keySaved começa true se o .env já
  // tem a chave.
  function initialKeySaved(cfgHasKey) {
    return Boolean(cfgHasKey);
  }

  // Decide o que fazer ao avançar do passo da chave:
  //   - typed vazio            → keep: preserva a chave existente (ou segue sem);
  //   - typed inválido         → invalid: bloqueia com erro (não persiste);
  //   - typed válido (sk-or-)  → save: substitui só após validação.
  function planKeyPersist(opts) {
    const existingHasKey = opts && opts.existingHasKey;
    const typed = ((opts && opts.typedKey) || "").trim();
    if (!typed) {
      return { action: "keep", keySaved: Boolean(existingHasKey) };
    }
    if (typed.indexOf("sk-or-") !== 0) {
      return { action: "invalid", error: "A chave OpenRouter começa com sk-or-…" };
    }
    return { action: "save", value: typed, keySaved: true };
  }

  return { initialKeySaved, planKeyPersist };
});
