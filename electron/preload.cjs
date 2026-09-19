const { contextBridge, ipcRenderer } = require('electron');

const ALIPAY_STATUS_CHANNELS = new Set(['alipay-success', 'alipay-failure']);

contextBridge.exposeInMainWorld('guardianElectron', {
  onAlipayStatus(channel, listener) {
    if (!ALIPAY_STATUS_CHANNELS.has(channel) || typeof listener !== 'function') {
      throw new Error('Unsupported IPC channel');
    }
    const wrapped = () => listener();
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
