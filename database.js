const path = require('path');
const fs = require('fs');

let Database;
try {
  ({ DatabaseSync: Database } = require('node:sqlite'));
} catch (error) {
  Database = require('better-sqlite3');
}

// Descobre a pasta segura do Windows para não ter erro de permissão
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share');
const pastaSegura = path.join(appDataPath, 'escala-coroinhas');

if (!fs.existsSync(pastaSegura)) {
    fs.mkdirSync(pastaSegura, { recursive: true });
}

const dbPath = path.join(pastaSegura, 'escala_coroinhas.db');
const db = typeof Database === 'function' ? new Database(dbPath) : new Database(dbPath);

// Criação das Tabelas Exatamente como Eram!
db.exec(`
  CREATE TABLE IF NOT EXISTS coroinhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    data_nascimento TEXT,
    responsavel TEXT,
    telefone TEXT,
    endereco TEXT,
    nivel TEXT DEFAULT 'coroinha',
    tipo TEXT DEFAULT 'Coroinha'
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
    presente INTEGER DEFAULT 0,
    FOREIGN KEY(id_evento) REFERENCES eventos(id),
    FOREIGN KEY(id_funcao) REFERENCES funcoes(id),
    FOREIGN KEY(id_coroinha) REFERENCES coroinhas(id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user'
  );
`);

// Inserir as funções básicas
const row = db.prepare('SELECT count(*) as count FROM funcoes').get();
if (row.count === 0) {
  const insert = db.prepare('INSERT INTO funcoes (nome, descricao) VALUES (?, ?)');
  ['Turiferário', 'Cerimoniário', 'Naveta', 'Cruz Processional', 'Tocha 1', 'Tocha 2', 'Missal', 'Credência'].forEach(f => insert.run(f, 'Função Litúrgica'));
}

module.exports = db;