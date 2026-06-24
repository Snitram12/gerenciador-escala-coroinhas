const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('escala_coroinhas.db');

db.serialize(() => {
    // Tabela de Coroinhas
    db.run(`CREATE TABLE IF NOT EXISTS coroinhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        data_nascimento TEXT,
        responsavel TEXT,
        telefone TEXT,
        endereco TEXT,
        nivel TEXT
    )`);

    // Tabela de Funções
    db.run(`CREATE TABLE IF NOT EXISTS funcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        descricao TEXT
    )`);

    // Tabela de Eventos
    db.run(`CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT,
        horario TEXT,
        igreja TEXT,
        qtd_coroinhas INTEGER,
        funcoes_necessarias TEXT,
        titulo TEXT
    )`);

    // Tabela de Escalas
    db.run(`CREATE TABLE IF NOT EXISTS escalas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_evento INTEGER,
        id_funcao INTEGER,
        id_coroinha INTEGER,
        funcao_temp TEXT,
        presente INTEGER DEFAULT 0,
        FOREIGN KEY(id_evento) REFERENCES eventos(id),
        FOREIGN KEY(id_coroinha) REFERENCES coroinhas(id)
    )`);

    console.log("Banco de dados e tabelas criados com sucesso!");
});

db.close();