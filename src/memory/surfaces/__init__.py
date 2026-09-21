"""Rendered surfaces for Mirror Core.

Until CV22.DS10.US1 this package held two unrelated things behind one name: the
web console's UI read models (atlas, workspace, evidence, objects, search, and
their models), and the text surfaces the CLI renders. The console retired, and
with it every module that existed only to feed it -- including the facade that
composed exactly those six and nothing else.

What remains is what the CLI renders directly. There is no facade: each caller
imports the renderer it needs, which is how `cli/build`, `cli/soul`,
`cli/explore`, and `skills/mirror` already used them.
"""
