'use strict'
/** 主进程 → 渲染端：只透传状态和外观参数，不给 node 能力 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('screenGlow', {
  onState(cb) {
    if (typeof cb !== 'function') return () => {}
    const handler = (_event, payload) => {
      try {
        cb(payload)
      } catch (error) {
        console.error('[screen-glow] renderer state handler failed', error)
      }
    }
    ipcRenderer.on('screen-glow:state', handler)
    return () => ipcRenderer.removeListener('screen-glow:state', handler)
  },
  reportError(message) {
    try { ipcRenderer.send('screen-glow:error', String(message).slice(0, 400)) } catch (e) {}
  },
  onLook(cb) {
    if (typeof cb !== 'function') return () => {}
    const handler = (_event, payload) => {
      try {
        cb(payload)
      } catch (error) {
        console.error('[screen-glow] renderer look handler failed', error)
      }
    }
    ipcRenderer.on('screen-glow:look', handler)
    return () => ipcRenderer.removeListener('screen-glow:look', handler)
  },
})
