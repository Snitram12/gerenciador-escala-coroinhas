const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Conecta ao banco de dados
const db = require('./database.js');

// === GARANTE QUE A COLUNA DE FREQUÊNCIA EXISTE ===
try {
    db.prepare(`ALTER TABLE escalas ADD COLUMN presente INTEGER DEFAULT NULL`).run();
    console.log("Coluna 'presente' verificada/criada com sucesso no banco de dados!");
} catch (err) {
    // Se der erro, é porque a coluna já existe. Ignoramos em silêncio.
}

let mainWindow = null; 

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 1000,   
    minHeight: 700,
    icon: path.join(__dirname, 'logo-paroquia.jpeg'), 
    autoHideMenuBar: true, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    // ─── Notificações do sistema operacional ─────────────────────────────────
    const notificacoes = require('./notificacoes.js');
    notificacoes.iniciar(db);

    // ─── IPC: Google Drive ────────────────────────────────────────────────────
    const gdrive = require('./google-drive.js');

    ipcMain.handle('gdrive:status', () => gdrive.estaAutenticado());

    ipcMain.handle('gdrive:conectar', async () => {
        await gdrive.conectar();
        return true;
    });

    ipcMain.handle('gdrive:desconectar', () => {
        gdrive.desconectar();
        return true;
    });

    ipcMain.handle('gdrive:upload', async (event, { base64, nomeArquivo }) => {
        const resultado = await gdrive.uploadImagem(base64, nomeArquivo);
        return resultado;
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});