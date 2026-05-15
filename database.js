const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 1. Descobre a pasta segura do Windows pela rota direta
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share");
const pastaSegura = path.join(appDataPath, 'escala-coroinhas');

// Cria a pasta segura se ela ainda não existir
if (!fs.existsSync(pastaSegura)) {
    fs.mkdirSync(pastaSegura, { recursive: true });
}

const dbPath = path.join(pastaSegura, 'escala_coroinhas.db');
const dbLocalPath = path.join(__dirname, 'escala_coroinhas.db'); // Onde estava o seu DB antigo

// 2. MÁGICA DO BACKUP: Se o banco antigo existir e o novo não, ele copia para você não perder seus dados!
if (fs.existsSync(dbLocalPath) && !fs.existsSync(dbPath)) {
    fs.copyFileSync(dbLocalPath, dbPath);
}

// 3. Conecta ao banco de dados no cofre seguro
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS coroinhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    data_nascimento TEXT,
    responsavel TEXT,
    telefone TEXT,
    endereco TEXT,
    nivel TEXT DEFAULT 'novato'
  );

  CREATE TABLE IF NOT EXISTS funcoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    descricao TEXT
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    horario TEXT NOT NULL,
    igreja TEXT NOT NULL,
    qtd_coroinhas INTEGER NOT NULL,
    funcoes_necessarias TEXT,
    titulo TEXT
  );

  CREATE TABLE IF NOT EXISTS escalas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_evento INTEGER,
    id_funcao INTEGER,
    id_coroinha INTEGER,
    funcao_temp TEXT,
    FOREIGN KEY(id_evento) REFERENCES eventos(id),
    FOREIGN KEY(id_funcao) REFERENCES funcoes(id),
    FOREIGN KEY(id_coroinha) REFERENCES coroinhas(id)
  );
`);

// Inserir as funções básicas, se a tabela estiver vazia
const row = db.prepare('SELECT count(*) as count FROM funcoes').get();
if (row.count === 0) {
  const insert = db.prepare('INSERT INTO funcoes (nome) VALUES (?)');
  ['Turiferário', 'Cerimoniário', 'Naveta', 'Cruz Processional', 'Tocha 1', 'Tocha 2', 'Missal', 'Credência'].forEach(f => insert.run(f));
}

module.exports = db;