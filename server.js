const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('./auth-utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  });
});

app.post('/api/register', async (req, res) => {
  const { username, password, role = 'user' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  if (!validatePasswordStrength(password)) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula e número.' });
  }

  const existing = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Usuário já existe.' });
  }

  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO usuarios (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);

  return res.status(201).json({ ok: true });
});

app.post('/api/membros', async (req, res) => {
  const { nome, dataNascimento, telefone, username, password, role = 'user' } = req.body;

  if (!nome || !username || !password) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios.' });
  }

  if (!validatePasswordStrength(password)) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula e número.' });
  }

  const existingUser = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(409).json({ error: 'Nome de usuário já cadastrado.' });
  }

  const nascimento = dataNascimento ? new Date(dataNascimento) : null;
  const hoje = new Date();
  let idade = null;
  if (nascimento) {
    idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade -= 1;
    }
  }

  const precisaResponsavel = idade !== null && idade < 18;
  const responsavel = req.body.responsavel || null;
  const telefoneResponsavel = req.body.telefoneResponsavel || null;

  if (precisaResponsavel && (!responsavel || !telefoneResponsavel)) {
    return res.status(400).json({ error: 'Para menores de 18 anos, informe o nome e telefone do responsável.' });
  }

  const passwordHash = await hashPassword(password);
  const usuarioInsert = db.prepare('INSERT INTO usuarios (username, password_hash, role) VALUES (?, ?, ?)');
  const result = usuarioInsert.run(username, passwordHash, role);

  const membroInsert = db.prepare(`
    INSERT INTO coroinhas (nome, data_nascimento, responsavel, telefone, endereco, nivel, tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  membroInsert.run(nome, dataNascimento || null, responsavel, telefone || null, req.body.endereco || null, req.body.nivel || 'coroinha', req.body.tipo || 'Coroinha');

  return res.status(201).json({ ok: true, userId: result.lastInsertRowid });
});

app.get('/api/membros', (req, res) => {
  const membros = db.prepare('SELECT id, nome, data_nascimento, responsavel, telefone, endereco, nivel, tipo FROM coroinhas ORDER BY nome ASC').all();
  res.json(membros);
});

app.get('/api/coroinhas', (req, res) => {
  const coroinhas = db.prepare('SELECT * FROM coroinhas ORDER BY nome ASC').all();
  res.json(coroinhas);
});

app.post('/api/coroinhas', async (req, res) => {
  const { nome, tipo, data_nascimento, responsavel, telefone, endereco } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const stmt = db.prepare('INSERT INTO coroinhas (nome, tipo, data_nascimento, responsavel, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(nome, tipo || 'Coroinha', data_nascimento || null, responsavel || null, telefone || null, endereco || null);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.put('/api/coroinhas/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, tipo, data_nascimento, responsavel, telefone, endereco } = req.body;
  const stmt = db.prepare('UPDATE coroinhas SET nome = ?, tipo = ?, data_nascimento = ?, responsavel = ?, telefone = ?, endereco = ? WHERE id = ?');
  stmt.run(nome, tipo || 'Coroinha', data_nascimento || null, responsavel || null, telefone || null, endereco || null, id);
  res.json({ ok: true });
});

app.delete('/api/coroinhas/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM escalas WHERE id_coroinha = ?').run(id);
  db.prepare('DELETE FROM coroinhas WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/sql', (req, res) => {
  const { query, params = [], type = 'all' } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query SQL obrigatória.' });
  }

  const trimmed = query.trim();
  const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
  const allowed = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'PRAGMA', 'CREATE', 'ALTER'];
  if (!allowed.includes(firstWord)) {
    return res.status(400).json({ error: `Operação SQL não permitida: ${firstWord}` });
  }

  try {
    const stmt = db.prepare(query);
    if (type === 'get') {
      return res.json(stmt.get(...params));
    }
    if (type === 'run') {
      const info = stmt.run(...params);
      return res.json({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
    }
    return res.json(stmt.all(...params));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/eventos', (req, res) => {
  const { mes } = req.query;
  let eventos;
  if (mes) {
    eventos = db.prepare('SELECT * FROM eventos WHERE data LIKE ? ORDER BY data ASC, horario ASC').all(`${mes}%`);
  } else {
    eventos = db.prepare('SELECT * FROM eventos ORDER BY data ASC, horario ASC').all();
  }
  res.json(eventos);
});

app.get('/api/eventos/:id', (req, res) => {
  const evento = db.prepare('SELECT * FROM eventos WHERE id = ?').get(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento não encontrado.' });
  res.json(evento);
});

app.post('/api/eventos', (req, res) => {
  const { data, horario, igreja, titulo, cor_bg, cor_texto, cor_borda } = req.body;
  if (!data || !horario || !igreja) return res.status(400).json({ error: 'Data, horário e igreja são obrigatórios.' });
  const stmt = db.prepare('INSERT INTO eventos (data, horario, igreja, titulo, cor_bg, cor_texto, cor_borda, qtd_coroinhas) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
  const result = stmt.run(data, horario, igreja, titulo || '', cor_bg || '#166534', cor_texto || '#ffffff', cor_borda || '#14532d');
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.put('/api/eventos/:id', (req, res) => {
  const { id } = req.params;
  const { data, horario, igreja, titulo, cor_bg, cor_texto, cor_borda } = req.body;
  if (!data || !horario || !igreja) return res.status(400).json({ error: 'Data, horário e igreja são obrigatórios.' });
  db.prepare('UPDATE eventos SET data = ?, horario = ?, igreja = ?, titulo = ?, cor_bg = ?, cor_texto = ?, cor_borda = ? WHERE id = ?').run(data, horario, igreja, titulo || '', cor_bg || '#166534', cor_texto || '#ffffff', cor_borda || '#14532d', id);
  res.json({ ok: true });
});

app.delete('/api/eventos/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM escalas WHERE id_evento = ?').run(id);
  db.prepare('DELETE FROM eventos WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/escala', (req, res) => {
  const { eventoId } = req.query;
  if (!eventoId) return res.status(400).json({ error: 'eventoId é obrigatório.' });
  const escala = db.prepare('SELECT esc.*, c.nome as coroinha_nome, c.tipo as coroinha_tipo FROM escalas esc JOIN coroinhas c ON esc.id_coroinha = c.id WHERE esc.id_evento = ? ORDER BY esc.posicao_vaga ASC').all(eventoId);
  res.json(escala);
});

app.post('/api/escala', (req, res) => {
  const { eventoId, idCoroinha, posicao, funcao_temp, presente } = req.body;
  if (!eventoId || !idCoroinha) return res.status(400).json({ error: 'eventoId e idCoroinha são obrigatórios.' });
  const stmt = db.prepare('INSERT INTO escalas (id_evento, id_coroinha, posicao_vaga, funcao_temp, presente) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(eventoId, idCoroinha, posicao || 0, funcao_temp || '', presente || 0);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.delete('/api/escala/:id', (req, res) => {
  db.prepare('DELETE FROM escalas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/dashboard', (req, res) => {
  const { mes } = req.query;
  const filtro = mes ? `${mes}%` : '%';
  const total = db.prepare('SELECT COUNT(DISTINCT id_evento) as total FROM eventos WHERE data LIKE ?').get(filtro).total || 0;
  const presente = db.prepare('SELECT SUM(presente) as total_pres FROM escalas WHERE presente = 1 AND id_evento IN (SELECT id FROM eventos WHERE data LIKE ?)').get(filtro).total_pres || 0;
  const totalEscalas = db.prepare('SELECT COUNT(*) as total FROM escalas WHERE id_evento IN (SELECT id FROM eventos WHERE data LIKE ?)').get(filtro).total || 0;
  const media = totalEscalas ? Math.round((presente / totalEscalas) * 100) : 0;
  const ranking = db.prepare('SELECT c.nome, SUM(esc.presente) as total_presencas, (SUM(esc.presente)*100.0/COUNT(esc.id)) as aproveitamento FROM escalas esc JOIN coroinhas c ON esc.id_coroinha = c.id JOIN eventos e ON esc.id_evento=e.id WHERE e.data LIKE ? AND esc.presente IN (0,1) GROUP BY c.id ORDER BY total_presencas DESC, aproveitamento DESC, c.nome ASC LIMIT 10').all(filtro);
  const grafico = db.prepare('SELECT e.igreja as missa, e.data, (SUM(esc.presente)*100.0/COUNT(esc.id)) as percentual FROM escalas esc JOIN eventos e ON esc.id_evento=e.id WHERE e.data LIKE ? AND esc.presente IN (0,1) GROUP BY e.id ORDER BY e.data ASC LIMIT 10').all(filtro);
  res.json({ totalMissas: total, mediaPresenca: `${media}%`, ranking, grafico });
});

app.get('/api/meses', (req, res) => {
  const meses = db.prepare(`SELECT DISTINCT strftime('%Y-%m', data) as mesAno FROM eventos ORDER BY mesAno DESC`).all();
  res.json(meses.map(r => r.mesAno));
});

app.get('/api/aspirantes', (req, res) => {
  const aspirantes = db.prepare('SELECT * FROM aspirantes ORDER BY nome ASC').all();
  res.json(aspirantes);
});

app.post('/api/aspirantes', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const stmt = db.prepare('INSERT INTO aspirantes (nome, progresso) VALUES (?, 0)');
  const result = stmt.run(nome);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.put('/api/aspirantes/:id', (req, res) => {
  const { id } = req.params;
  const { progresso } = req.body;
  db.prepare('UPDATE aspirantes SET progresso = ? WHERE id = ?').run(progresso || 0, id);
  res.json({ ok: true });
});

app.delete('/api/aspirantes/:id', (req, res) => {
  db.prepare('DELETE FROM aspirantes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Servidor ativo' });
});

function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) as count FROM usuarios').get().count;
  if (count > 0) return;

  const username = process.env.ADMIN_USERNAME || 'Administrador';
  const password = process.env.ADMIN_PASSWORD || 'Admin123';

  if (!validatePasswordStrength(password)) {
    console.log('A senha padrão do administrador não atende os requisitos de segurança.');
    return;
  }

  hashPassword(password).then((hash) => {
    db.prepare('INSERT INTO usuarios (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
    console.log('Usuário administrador inicial criado com sucesso.');
  });
}

ensureAdminUser();

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
