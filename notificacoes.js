/**
 * notificacoes.js
 * Módulo de notificações do sistema operacional para o Gerenciador de Coroinhas.
 *
 * Dispara notificações nativas do Windows para:
 *  1. Missa nas próximas 24h
 *  2. Missa nas próximas 24h SEM escala montada
 *  3. Aniversário de coroinha (apenas quem tem data_nascimento cadastrada)
 */

const { Notification, app } = require('electron');
const path = require('path');

// Ícone da paróquia (mesmo usado na janela)
const ICONE = path.join(app.getAppPath(), 'logo-paroquia.jpeg');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoje() {
    return new Date().toISOString().slice(0, 10); // AAAA-MM-DD
}

function amanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

function dataHojeMMDD() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
}

function formatarData(dataISO) {
    const [a, m, d] = dataISO.split('-');
    return `${d}/${m}/${a}`;
}

function notificar(titulo, corpo, urgente = false) {
    if (!Notification.isSupported()) return;
    const n = new Notification({
        title:   titulo,
        body:    corpo,
        icon:    ICONE,
        urgency: urgente ? 'critical' : 'normal',
        silent:  false,
    });
    n.show();
}

// ─── Verificações ─────────────────────────────────────────────────────────────

function verificarMissasProximas(db) {
    try {
        const dataHoje  = hoje();
        const dataAmanh = amanha();

        // Missas hoje e amanhã
        const missas = db.prepare(`
            SELECT e.*, COUNT(esc.id) as total_escalados
            FROM eventos e
            LEFT JOIN escalas esc ON e.id = esc.id_evento
            WHERE e.data IN (?, ?)
            GROUP BY e.id
            ORDER BY e.data ASC, e.horario ASC
        `).all(dataHoje, dataAmanh);

        if (missas.length === 0) return;

        missas.forEach(m => {
            const ehHoje   = m.data === dataHoje;
            const prefixo  = ehHoje ? 'Hoje' : 'Amanhã';
            const nome     = m.titulo || m.igreja;
            const horario  = m.horario;
            const temEscala = m.total_escalados > 0 || m.todos_convocados;

            if (!temEscala) {
                // ⚠️ Missa sem escala montada
                notificar(
                    `⚠️ Escala não montada — ${prefixo}`,
                    `"${nome}" às ${horario} ainda não tem coroinhas escalados!`,
                    true // urgente
                );
            } else {
                // ⛪ Missa com escala OK
                const qtd = m.todos_convocados
                    ? 'Todos convocados'
                    : `${m.total_escalados} coroinha(s)`;
                notificar(
                    `⛪ Missa ${prefixo.toLowerCase()} — ${horario}`,
                    `"${nome}" · ${qtd} escalado(s).`
                );
            }
        });

    } catch(e) {
        console.error('[Notificações] Erro ao verificar missas:', e.message);
    }
}

function verificarAniversarios(db) {
    try {
        const hoje_mmdd = dataHojeMMDD();

        // Busca coroinhas que fazem aniversário hoje (ignora quem não tem data)
        const aniversariantes = db.prepare(`
            SELECT nome, data_nascimento
            FROM coroinhas
            WHERE data_nascimento IS NOT NULL
              AND data_nascimento != ''
              AND substr(data_nascimento, 6, 5) = ?
        `).all(hoje_mmdd);

        aniversariantes.forEach(c => {
            const nascimento = c.data_nascimento;
            const anoNasc    = parseInt(nascimento.slice(0, 4));
            const anoAtual   = new Date().getFullYear();
            const idade      = anoAtual - anoNasc;

            notificar(
                `🎂 Aniversário hoje!`,
                `${c.nome} completa ${idade} anos hoje. Parabéns! 🎉`
            );
        });

    } catch(e) {
        console.error('[Notificações] Erro ao verificar aniversários:', e.message);
    }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicializa o sistema de notificações.
 * - Dispara imediatamente ao iniciar
 * - Repete a cada 30 minutos enquanto o app estiver aberto
 *
 * @param {object} db - Instância do banco better-sqlite3
 */
function iniciar(db) {
    // Pequeno delay para o app estar totalmente pronto
    setTimeout(() => {
        verificarMissasProximas(db);
        verificarAniversarios(db);
    }, 3000);

    // Repete a cada 30 minutos
    setInterval(() => {
        verificarMissasProximas(db);
        verificarAniversarios(db);
    }, 30 * 60 * 1000);
}

module.exports = { iniciar };