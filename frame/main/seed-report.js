"use strict";
// Classifica o resultado do `memory seed`.
// Política (review do PR #32, item 1): o seed sai com exit code != 0 diante de
// QUALQUER aviso, então o exit code não decide. Decidimos pelo relatório:
//   - ok            → errors === 0 e há um "Result:" coerente;
//   - ok-warning    → há erros, mas TODOS são exatamente o aviso conhecido e
//                     preexistente `ego/constraints: empty content` (allowlist);
//   - fail          → qualquer outro erro, combinação de erros, "Result:"
//                     inconsistente/ausente, ou crash sem relatório.
// Falha de onboarding remove o marcador e volta ao wizard; erro desconhecido
// NUNCA vira sucesso parcial silencioso.

// Allowlist explícita do único aviso conhecido e tolerado.
const KNOWN_WARNINGS = [/^ego\/constraints:\s*empty content$/i];

function parseSeedReport(stdout) {
  const text = String(stdout ?? "");
  const m = /Result:\s*(\d+)\s*created,\s*(\d+)\s*updated,\s*(\d+)\s*skipped/.exec(text);
  if (!m) return null; // sem relatório coerente = crash real
  const created = Number(m[1]);
  const updated = Number(m[2]);
  const skipped = Number(m[3]);

  const errCount = (/Errors:\s*(\d+)/.exec(text) ?? [])[1];
  const errors = errCount !== undefined ? Number(errCount) : 0;

  // coleta as linhas de erro listadas após "Errors: N" ("  - <id>: <msg>")
  const errorLines = [];
  const errBlock = /Errors:\s*\d+\s*\n([\s\S]*)$/.exec(text);
  if (errBlock) {
    for (const raw of errBlock[1].split("\n")) {
      const line = raw.trim();
      if (line.startsWith("- ")) errorLines.push(line.slice(2).trim());
      else if (line && !/^Result:/i.test(line)) continue;
    }
  }
  return { created, updated, skipped, errors, errorLines };
}

function classifySeed(report) {
  if (!report) return { status: "fail", reason: "sem relatório de criação (crash)" };
  const { created, updated, skipped, errors, errorLines } = report;

  // Seed é idempotente: num rebind/retry válido TODAS as entradas podem vir
  // como skipped (0 created). O que importa é o total processado — zero total
  // é que indica relatório inconsistente.
  const total = created + updated + skipped;

  if (errors === 0) {
    if (total <= 0) return { status: "fail", reason: "relatório sem entradas processadas" };
    return { status: "ok", warning: null };
  }

  // Só é warning tolerado se a contagem bate com as linhas listadas E todas as
  // linhas estão na allowlist. Contagem sem linhas, linha desconhecida, ou mais
  // de uma linha (não-conhecida) = falha.
  const listed = errorLines.length;
  const allKnown = listed > 0 && errorLines.every((e) => KNOWN_WARNINGS.some((re) => re.test(e)));
  if (listed === errors && allKnown && total > 0) {
    return { status: "ok-warning", warning: errorLines[0] };
  }
  return {
    status: "fail",
    reason: listed
      ? `erro(s) de seed não reconhecido(s): ${errorLines.join("; ")}`
      : `${errors} erro(s) de seed sem detalhamento reconhecível`,
  };
}

module.exports = { parseSeedReport, classifySeed };
