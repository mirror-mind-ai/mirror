"use strict";
// API estreita exposta ao renderer — nada de Node cru do lado da UI.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mirror", {
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    save: (values) => ipcRenderer.invoke("config:save", values),
    revertOnboarding: () => ipcRenderer.invoke("config:revertOnboarding"),
  },
  cmd: {
    run: (id, opts) => ipcRenderer.invoke("cmd:run", id, opts),
  },
  session: {
    open: () => ipcRenderer.invoke("session:open"),
    openSystem: (script) => ipcRenderer.invoke("session:openSystem", script),
    input: (id, data) => ipcRenderer.send("session:input", id, data),
    resize: (id, cols, rows) => ipcRenderer.send("session:resize", id, cols, rows),
    close: (id) => ipcRenderer.invoke("session:close", id),
    onData: (fn) => ipcRenderer.on("session:data", (_e, id, data) => fn(id, data)),
    onExit: (fn) => ipcRenderer.on("session:exit", (_e, id, code) => fn(id, code)),
  },
  gate: {
    onChange: (fn) => ipcRenderer.on("gate:changed", (_e, st) => fn(st)),
  },
  login: {
    providers: () => ipcRenderer.invoke("login:providers"),
    start: (slug) => ipcRenderer.invoke("login:start", slug),
    onChange: (fn) => ipcRenderer.on("login:changed", (_e, list) => fn(list)),
  },
});
