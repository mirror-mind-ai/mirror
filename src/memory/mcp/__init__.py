"""Mirror MCP server: a zero-dependency stdio JSON-RPC surface (CV21.E2.S2).

Exposes Mirror's on-demand identity context and read tools to any MCP-capable
runtime. Tools call the ``MemoryClient`` façade in-process (layer model:
``mcp -> services``). The server is hand-rolled over newline-delimited JSON-RPC
2.0 on stdio — no third-party MCP SDK — to keep the local-first core lean.
"""
