/**
 * google-drive.js
 * Módulo de integração com Google Drive para o Gerenciador de Coroinhas.
 * Salva automaticamente as imagens de escala numa pasta no Drive.
 */

require('dotenv').config(); // Puxa as variáveis do arquivo .env

const { shell, app } = require('electron');
const { createServer } = require('http');
const { request, get } = require('https');
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');

// ─── Credenciais OAuth ────────────────────────────────────────────────────────
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:42813';
const SCOPES        = 'https://www.googleapis.com/auth/drive.file';

// ─── Onde o token fica salvo localmente ──────────────────────────────────────
const TOKEN_PATH = join(app.getPath('userData'), 'gdrive_token.json');

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────
function httpsPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const data   = typeof body === 'string' ? body : JSON.stringify(body);
        const req = request({
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'POST',
            headers:  { ...headers, 'Content-Length': Buffer.byteLength(data) }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve(raw); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function httpsPostMultipart(metadata, imageBuffer, accessToken) {
    return new Promise((resolve, reject) => {
        const boundary = '-------escalacoroinhas_boundary';
        const metaStr  = JSON.stringify(metadata);

        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
            imageBuffer,
            Buffer.from(`\r\n--${boundary}--`)
        ]);

        const req = request({
            hostname: 'www.googleapis.com',
            path:     '/upload/drive/v3/files?uploadType=multipart',
            method:   'POST',
            headers:  {
                'Authorization':  `Bearer ${accessToken}`,
                'Content-Type':   `multipart/related; boundary="${boundary}"`,
                'Content-Length': body.length
            }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve(raw); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function httpsGet(url, accessToken) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        get({
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            headers:  { 'Authorization': `Bearer ${accessToken}` }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve(raw); }
            });
        }).on('error', reject);
    });
}

// ─── Token ───────────────────────────────────────────────────────────────────
function carregarToken() {
    try {
        if (existsSync(TOKEN_PATH)) {
            return JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
        }
    } catch {}
    return null;
}

function salvarToken(token) {
    // Guarda o momento em que o token foi obtido para checar expiração
    token.obtained_at = Date.now();
    writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function refreshAccessToken(token) {
    const params = new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type:    'refresh_token'
    });
    const novo = await httpsPost(
        'https://oauth2.googleapis.com/token',
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        params.toString()
    );
    if (novo.access_token) {
        token.access_token = novo.access_token;
        token.obtained_at  = Date.now();
        token.expires_in   = novo.expires_in || 3600;
        salvarToken(token);
        return token;
    }
    throw new Error('Falha ao renovar token: ' + JSON.stringify(novo));
}

async function getAccessToken() {
    let token = carregarToken();
    if (!token) return null;

    const expiresIn  = (token.expires_in || 3600) * 1000;
    const obtainedAt = token.obtained_at || 0;
    const expirando  = Date.now() > obtainedAt + expiresIn - 60000; // 1 min de margem

    if (expirando && token.refresh_token) {
        token = await refreshAccessToken(token);
    }
    return token.access_token;
}

// ─── OAuth: abre navegador + escuta callback ──────────────────────────────────
function autenticar() {
    return new Promise((resolve, reject) => {
        // Servidor local temporário para capturar o code
        const server = createServer(async (req, res) => {
            const url    = new URL(req.url, 'http://localhost:42813');
            const code   = url.searchParams.get('code');
            const errMsg = url.searchParams.get('error');

            if (errMsg) {
                res.end('<h2>Autorização cancelada.</h2><p>Pode fechar esta aba.</p>');
                server.close();
                return reject(new Error('Autorização negada pelo usuário.'));
            }

            if (!code) {
                res.end('<p>Aguardando...</p>');
                return;
            }

            // Troca o code pelo token
            res.end(`
                <html><body style="font-family:sans-serif;text-align:center;padding:40px">
                <h2 style="color:#166534">✅ Conectado com sucesso!</h2>
                <p>Pode fechar esta aba e voltar ao sistema.</p>
                </body></html>`);
            server.close();

            try {
                const params = new URLSearchParams({
                    code,
                    client_id:     CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri:  REDIRECT_URI,
                    grant_type:    'authorization_code'
                });
                const token = await httpsPost(
                    'https://oauth2.googleapis.com/token',
                    { 'Content-Type': 'application/x-www-form-urlencoded' },
                    params.toString()
                );
                if (!token.access_token) throw new Error(JSON.stringify(token));
                salvarToken(token);
                resolve(token.access_token);
            } catch (e) { reject(e); }
        });

        server.listen(42813, () => {
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                new URLSearchParams({
                    client_id:     CLIENT_ID,
                    redirect_uri:  REDIRECT_URI,
                    response_type: 'code',
                    scope:         SCOPES,
                    access_type:   'offline',
                    prompt:        'consent'
                }).toString();

            shell.openExternal(authUrl);
        });

        server.on('error', reject);
    });
}

// ─── Pasta no Drive ───────────────────────────────────────────────────────────
const NOME_PASTA = 'Escalas Litúrgicas - Cariré';
let   _pastaIdCache = null;

async function obterOuCriarPasta(accessToken) {
    if (_pastaIdCache) return _pastaIdCache;

    // Procura se já existe
    const query    = encodeURIComponent(`name='${NOME_PASTA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const resultado = await httpsGet(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
        accessToken
    );

    if (resultado.files && resultado.files.length > 0) {
        _pastaIdCache = resultado.files[0].id;
        return _pastaIdCache;
    }

    // Cria a pasta
    const nova = await httpsPostMultipartJSON(
        { name: NOME_PASTA, mimeType: 'application/vnd.google-apps.folder' },
        accessToken
    );
    _pastaIdCache = nova.id;
    return _pastaIdCache;
}

function httpsPostMultipartJSON(metadata, accessToken) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(metadata);
        const req  = request({
            hostname: 'www.googleapis.com',
            path:     '/drive/v3/files',
            method:   'POST',
            headers:  {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve(raw); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica se já está autenticado.
 */
function estaAutenticado() {
    const token = carregarToken();
    return !!(token && (token.refresh_token || token.access_token));
}

/**
 * Inicia o fluxo de autenticação OAuth.
 * Retorna o access_token após autorização.
 */
async function conectar() {
    return await autenticar();
}

/**
 * Desconecta removendo o token salvo.
 */
function desconectar() {
    _pastaIdCache = null;
    if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH);
}

/**
 * Faz upload de uma imagem PNG (Buffer ou base64 string) para o Drive.
 * @param {Buffer|string} imagemData  - Buffer PNG ou string base64
 * @param {string}        nomeArquivo - Nome do arquivo no Drive
 * @returns {Promise<{id, name, webViewLink}>}
 */
async function uploadImagem(imagemData, nomeArquivo) {
    let accessToken = await getAccessToken();
    if (!accessToken) throw new Error('NÃO_AUTENTICADO');

    const buffer = Buffer.isBuffer(imagemData)
        ? imagemData
        : Buffer.from(imagemData, 'base64');

    const pastaId  = await obterOuCriarPasta(accessToken);
    const metadata = {
        name:    nomeArquivo,
        parents: [pastaId]
    };

    const resultado = await httpsPostMultipart(metadata, buffer, accessToken);
    if (!resultado.id) throw new Error('Falha no upload: ' + JSON.stringify(resultado));

    // Torna o arquivo acessível por link (opcional, mas útil)
    await tornarPublico(resultado.id, accessToken);

    return resultado;
}

async function tornarPublico(fileId, accessToken) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ role: 'reader', type: 'anyone' });
        const req  = request({
            hostname: 'www.googleapis.com',
            path:     `/drive/v3/files/${fileId}/permissions`,
            method:   'POST',
            headers:  {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => { res.resume(); res.on('end', resolve); });
        req.on('error', resolve); // não bloqueia se falhar
        req.write(body);
        req.end();
    });
}

module.exports = { estaAutenticado, conectar, desconectar, uploadImagem };