const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        const requestId = data.id;
        ipcRenderer.send(channel, data);
        
        // Listen for the response from the backend
        ipcRenderer.on(`nexa-res-${requestId}`, (event, argResponse) => {
            window.dispatchEvent(new CustomEvent(`nexa-res-${requestId}`, { detail: argResponse }));
        });
    }
});
