[< Story](index.md)

# Plan — CV13.E6.S4 Cancellation and failure semantics

Add cooperative cancellation to the async operation run model. Cancellation is represented as durable state and event evidence, not as unsafe thread termination. Active runs can receive a cancellation request; if the worker sees the request before execution, it marks the run cancelled. Short operations may complete before cancellation is observed.
