"use strict";
// Leitura/escrita do .env na raiz do Mirror.
// Regras Windows da ES-004: UTF-8 SEM BOM, LF, preservar comentários e chaves
// desconhecidas (o .env é compartilhado com o core Python e com o mirror-logger).
const fs = require("node:fs");
const path = require("node:path");

function envPath(root) { return path.join(root, ".env"); }

function stripBom(s) { return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }

function loadEnvFile(root) {
  const file = envPath(root);
  if (!fs.existsSync(file)) return {};
  const text = stripBom(fs.readFileSync(file, "utf8"));
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

// Chaves que o frame tem permissão de gravar, com o formato aceito de cada
// valor. Nenhum valor pode conter quebras de linha — um '\n' embutido criaria
// uma variável nova no .env (injeção).
const ALLOWED_KEYS = {
  MIRROR_USER: /^[^\r\n]{1,128}$/,
  OPENROUTER_API_KEY: /^sk-or-[^\s\r\n]{1,256}$/,
};

function assertWritable(key, value) {
  const rule = ALLOWED_KEYS[key];
  if (!rule) throw new Error(`chave não permitida no .env: ${key}`);
  if (typeof value !== "string" || /[\r\n]/.test(value) || !rule.test(value)) {
    throw new Error(`valor inválido para ${key}`);
  }
}

function saveEnvValues(root, values) {
  for (const [k, v] of Object.entries(values)) assertWritable(k, v);
  const file = envPath(root);
  let lines = [];
  if (fs.existsSync(file)) {
    lines = stripBom(fs.readFileSync(file, "utf8")).split(/\r?\n/);
  }
  const pending = new Map(Object.entries(values));
  const next = lines.map((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && pending.has(m[1]) && !line.trimStart().startsWith("#")) {
      const k = m[1];
      const v = pending.get(k);
      pending.delete(k);
      return `${k}=${v}`;
    }
    return line;
  });
  while (next.length && next[next.length - 1] === "") next.pop();
  for (const [k, v] of pending) next.push(`${k}=${v}`);
  fs.writeFileSync(file, next.join("\n") + "\n", { encoding: "utf8" });
}

// Remove chaves do .env preservando comentários e chaves desconhecidas.
// Usado pela recuperação do onboarding: se init/seed falharem depois de o
// MIRROR_USER ter sido gravado, o marcador é revertido para que o próximo
// boot volte ao wizard em vez de considerar o onboarding completo.
function removeEnvKeys(root, keys) {
  const file = envPath(root);
  if (!fs.existsSync(file)) return;
  const drop = new Set(keys);
  const lines = stripBom(fs.readFileSync(file, "utf8")).split(/\r?\n/).filter((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    return !(m && drop.has(m[1]) && !line.trimStart().startsWith("#"));
  });
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  fs.writeFileSync(file, lines.length ? lines.join("\n") + "\n" : "", { encoding: "utf8" });
}

function isFirstRun(root) {
  const env = loadEnvFile(root);
  return !env.MIRROR_USER && !env.MIRROR_HOME;
}

module.exports = { loadEnvFile, saveEnvValues, removeEnvKeys, isFirstRun };
