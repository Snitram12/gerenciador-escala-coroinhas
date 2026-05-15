const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 1000,   // Não deixa a tela encolher demais
    minHeight: 700,
    icon: path.join(__dirname, 'logo-paroquia.jpeg'), // Sua logo aqui!
    autoHideMenuBar: true, // Esconde a barra de menu padrão
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

// Isso garante que o ícone apareça corretamente na barra de tarefas do Windows
app.setAppUserModelId("com.paroquia.escala-coroinhas");

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});