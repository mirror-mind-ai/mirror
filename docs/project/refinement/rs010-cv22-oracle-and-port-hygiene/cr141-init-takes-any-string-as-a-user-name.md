[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR141 — `init` takes any string as a user name, so `init ../escaped` creates a home outside `.mirror-minds`

## Problem

`mirror init <user>` reads its one positional and hands it to `initUserHome` with no
check beyond "not empty" (`runInit`, `ts/src/frontDoor/cli.ts`). The name becomes a
directory, `~/.mirror-minds/<user>`, and the value of `MIRROR_USER`, which the wiring
lines `init` prints put into shell commands. On `main` before PR #43, in a scratch home:

```text
$ mirror init --help          # exit 0; creates ~/.mirror-minds/--help, templates and all
$ mirror init ../escaped      # exit 0; creates ~/escaped -- outside .mirror-minds
$ mirror init "My User"       # exit 0; creates "~/.mirror-minds/My User", MIRROR_USER="My User"
$ mirror init a/b             # exit 0; creates ~/.mirror-minds/a/b
```

PR #43 (@rodrigoimmaginario, found while dogfooding `init --help` on Windows) refuses a
word that starts with `-`, with the usage line and exit 2. That is the first row. The
other three are the same defect: a user name is a key that goes into paths and shell
commands, and nothing constrains it.

The repository already decided this class. CR104 made journey slugs and persona ids
kebab-case keys, because agents put them into commands and a kebab-case key is one plain
word a shell cannot split, substitute, or read as an option
(`ts/src/util/slug.ts`, `ts/src/identity/identityKey.ts`; REFERENCE.md, "A new journey
slug or persona id must be kebab-case"). `identity set`, `identity edit`, and `seed`
refuse any other new key, write nothing, and name one that would work. `init` is the
one command that creates a key of this kind and does not ask.

## Expected Behavior

- `init <user>` accepts a kebab-case key, `isKebabSlug`, and nothing else. A refused name
  creates nothing: no home, no identity directory, no config write.
- The refusal is CR104's sentence, consequence first, then the rule, then a key that
  would work: `no user home was created: '../escaped' is not a user name. Use lowercase
  letters, digits, and single hyphens, up to 80 characters, for example 'escaped'.` The
  key is printed escaped, as `newIdentityKeyProblem` prints it. Exit 2, as the missing
  argument exits.
- PR #43's `init --help` test keeps passing: a word that starts with `-` is not a
  kebab-case key.
- REFERENCE.md names `init` beside the three commands that refuse a non-key.
- Existing homes are untouched: `init` only creates. A person whose home already has
  another kind of name keeps it; `MIRROR_USER` selection of an existing home is not
  this CR's.

## Impact

Low in likelihood, since a person types their own name once; real in kind, since the
traversal row writes outside the directory the product owns, and the space row puts a
value into `MIRROR_USER` that every printed wiring command then carries unquoted. The
same reasoning closed CR104 for slugs; this is its last open key.

## Plan Or Decision

Captured 2026-10-17 from the review of PR #43, which merged with its `-` check as the
first row (`78477b01`). The Navigator's decision at that review: merge, capture the rest,
work it at once. Driver `@viniciusteles`, Delivery `main`, status `in_progress`.

The change is one line in `runInit` plus its message, with `isKebabSlug` and
`kebabSlug` from `#util/slug.ts` and `pyRepr` as `identityKey.ts` uses it. The test is
PR #43's, widened: the four rows above, each asserting exit 2, the sentence, and that no
directory appeared under `$HOME`.

## Evidence

```text
$ H=$(mktemp -d); for u in "../escaped" "My User" "a/b"; do HOME="$H" MIRROR_USER= mirror init "$u"; done   # main, 2026-10-17
../escaped   exit=0  created: escaped escaped/identity
My User      exit=0  created: .mirror-minds/My User
a/b          exit=0  created: .mirror-minds/a/b
```

- `ts/src/frontDoor/cli.ts` — `runInit`, the one check.
- `ts/src/identity/identityKey.ts` — `newIdentityKeyProblem`, the sentence shape and the
  escaping; `ts/src/util/slug.ts` — `isKebabSlug`, `kebabSlug`.
- CR104 — the decision this CR extends to the last key of its kind.
- PR #43 — the first row, and the finding.

## Outcome

Pending.
