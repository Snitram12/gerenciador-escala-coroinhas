const db = require('./database');
const XLSX = require('xlsx');

// ==========================================
// VERIFICAÇÃO DE SEGURANÇA DO BANCO DE DADOS
// ==========================================
// 1. Corrige o erro "no column named posicao_vaga" automaticamente
try { db.prepare(`ALTER TABLE escalas ADD COLUMN posicao_vaga INTEGER DEFAULT 0`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE escalas ADD COLUMN funcao_temp TEXT`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE eventos ADD COLUMN todos_convocados INTEGER DEFAULT 0`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE eventos ADD COLUMN cor_bg TEXT DEFAULT '#dcfce7'`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE eventos ADD COLUMN cor_texto TEXT DEFAULT '#166534'`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE eventos ADD COLUMN cor_borda TEXT DEFAULT '#bbf7d0'`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE coroinhas ADD COLUMN data_nascimento TEXT DEFAULT NULL`).run(); } catch(e){}
try { db.prepare(`CREATE TABLE IF NOT EXISTS aspirantes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, progresso INTEGER DEFAULT 0)`).run(); } catch(e){}

// 2. Descobre qual era o nome da sua coluna de Mestre/Coroinha (para não dar 'undefined')
let colunaTipo = 'tipo';
const infoCoroinhas = db.prepare("PRAGMA table_info(coroinhas)").all().map(c => c.name.toLowerCase());

if (infoCoroinhas.includes('tipo')) colunaTipo = 'tipo';
else if (infoCoroinhas.includes('funcao')) colunaTipo = 'funcao';
else if (infoCoroinhas.includes('cargo')) colunaTipo = 'cargo';
else if (infoCoroinhas.includes('grau')) colunaTipo = 'grau';
else {
    // Se não achar nenhuma, cria a coluna 'tipo' padrão
    try { db.prepare(`ALTER TABLE coroinhas ADD COLUMN tipo TEXT DEFAULT 'Coroinha'`).run(); } catch(e){}
}

// ==========================================
// CONTROLE DE NAVEGAÇÃO
// ==========================================

const abas = ['dashboard', 'cadastro', 'lista', 'calendario', 'formacao'];

function mudarAba(abaSelecionada) {
    abas.forEach(aba => {
        const btn = document.getElementById(`btn-aba-${aba}`);
        const cont = document.getElementById(`aba-${aba}`);
        if(aba === abaSelecionada) {
            if(cont) cont.classList.remove('hidden');
            if(btn) btn.classList.add('bg-emerald-50', 'text-emerald-700');
            if(btn) btn.classList.remove('text-gray-600', 'hover:bg-gray-50');
        } else {
            if(cont) cont.classList.add('hidden');
            if(btn) btn.classList.remove('bg-emerald-50', 'text-emerald-700');
            if(btn) btn.classList.add('text-gray-600', 'hover:bg-gray-50');
        }
    });

    if (abaSelecionada === 'dashboard') carregarDadosDashboard();
    if (abaSelecionada === 'lista') listarCoroinhas();
    if (abaSelecionada === 'calendario') renderizarGradeCalendario();
    if (abaSelecionada === 'formacao') listarAspirantes();
}

function fecharModal(idModal) {
    document.getElementById(idModal).classList.add('hidden');
}

// ==========================================
// TEMA E DASHBOARD
// ==========================================
function aplicarTemaLiturgico() {
    const data = new Date();
    const mes = data.getMonth() + 1;
    const dia = data.getDate();
    let cor = 'bg-emerald-600'; 
    
    if ((mes === 3) || (mes === 12 && dia < 25)) cor = 'bg-indigo-800'; 
    else if ((mes === 12 && dia >= 25) || (mes === 1) || (mes === 4)) cor = 'bg-amber-600';

    const navbar = document.getElementById('navbar_topo');
    if(navbar) {
        navbar.classList.remove('bg-emerald-600', 'bg-indigo-800', 'bg-amber-600');
        navbar.classList.add(cor);
    }
    const imgHeader = document.getElementById('img_header_borda');
    if(imgHeader) {
        imgHeader.classList.remove('border-emerald-600', 'border-indigo-800', 'border-amber-600');
        imgHeader.classList.add(cor.replace('bg-', 'border-'));
    }
}

function popularFiltroMeses() {
    const select = document.getElementById('dash_filtro_mes');
    if (!select) return;
    const meses = db.prepare(`SELECT DISTINCT strftime('%Y-%m', data) as mesAno FROM eventos ORDER BY mesAno DESC`).all();
    select.innerHTML = '';
    if (meses.length === 0) {
        select.innerHTML = `<option value="${new Date().toISOString().substring(0, 7)}">Sem dados</option>`;
        return;
    }
    meses.forEach(m => {
        const [ano, numMes] = m.mesAno.split('-');
        const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        select.innerHTML += `<option value="${m.mesAno}">${nomes[parseInt(numMes)-1]} / ${ano}</option>`;
    });
}

function carregarDadosDashboard() {
    const selectMes = document.getElementById('dash_filtro_mes');
    if (!selectMes || !selectMes.value) return;
    const filtro = `${selectMes.value}%`;

    const rTotal = db.prepare(`SELECT COUNT(DISTINCT esc.id_evento) as total FROM escalas esc JOIN eventos e ON esc.id_evento = e.id WHERE esc.presente IS NOT NULL AND e.data LIKE ?`).get(filtro);
    const rGeral = db.prepare(`SELECT (SUM(esc.presente) * 100.0 / COUNT(esc.id)) as media FROM escalas esc JOIN eventos e ON esc.id_evento = e.id WHERE e.data LIKE ? AND esc.presente IS NOT NULL`).get(filtro);
    const rRanking = db.prepare(`SELECT c.nome, SUM(esc.presente) as total_presencas, (SUM(esc.presente) * 100.0 / COUNT(esc.id)) as aproveitamento FROM escalas esc JOIN coroinhas c ON esc.id_coroinha = c.id JOIN eventos e ON esc.id_evento = e.id WHERE e.data LIKE ? AND esc.presente IS NOT NULL GROUP BY c.id ORDER BY total_presencas DESC, aproveitamento DESC, c.nome ASC LIMIT 10`).all(filtro);
    const rGrafico = db.prepare(`SELECT e.igreja, e.data, (SUM(esc.presente) * 100.0 / COUNT(esc.id)) as percentual FROM escalas esc JOIN eventos e ON esc.id_evento = e.id WHERE e.data LIKE ? AND esc.presente IS NOT NULL GROUP BY e.id ORDER BY e.data ASC LIMIT 10`).all(filtro);

    document.getElementById('dash_total_missas').innerText = rTotal ? rTotal.total : 0;
    document.getElementById('dash_media_presenca').innerText = rGeral && rGeral.media ? `${Math.round(rGeral.media)}%` : '0%';

    const containerRanking = document.getElementById('dash_lista_ranking');
    containerRanking.innerHTML = rRanking.length === 0 ? `<p class="text-xs text-gray-400 text-center py-4">Nenhuma frequência registrada.</p>` : '';
    rRanking.forEach((c, idx) => {
        const medalha = idx < 3 ? `<i class="fas fa-medal text-amber-500"></i>` : `<span class="text-gray-400">${idx + 1}</span>`;
        containerRanking.innerHTML += `<div class="flex justify-between p-2.5 bg-gray-50 border rounded-lg text-xs font-bold mb-2"><div>${medalha} <span class="ml-2">${c.nome}</span></div><div class="text-emerald-600">${c.total_presencas} P</div></div>`;
    });

    const containerGrafico = document.getElementById('dash_container_grafico');
    containerGrafico.innerHTML = rGrafico.length === 0 ? `<p class="text-xs text-gray-400 text-center w-full py-4">Sem dados</p>` : '';
    rGrafico.forEach(g => {
        const pct = Math.round(g.percentual || 0);
        containerGrafico.innerHTML += `
            <div class="flex flex-col items-center h-full justify-end group relative flex-1">
                <div class="w-full bg-emerald-500 rounded-t-md hover:bg-emerald-600 transition-all cursor-pointer shadow-xs" style="height: ${Math.max(pct, 5)}%"></div>
                <span class="text-[9px] font-black text-gray-400 uppercase tracking-tight mt-1 truncate w-full text-center" title="${g.igreja}">${g.data.split('-').reverse().slice(0, 2).join('/')}</span>
            </div>`;
    });
}

// ==========================================
// EXCEL E FREQUÊNCIA
// ==========================================

function exportarFrequenciaExcel() {
    try {
        const missasDisponiveis = db.prepare(`
            SELECT e.id, e.data, e.horario, e.igreja, e.titulo, e.todos_convocados,
                   COUNT(esc.id) as total_escalados,
                   SUM(CASE WHEN esc.presente IS NOT NULL THEN 1 ELSE 0 END) as total_com_presenca
            FROM eventos e
            JOIN escalas esc ON e.id = esc.id_evento
            JOIN coroinhas c ON esc.id_coroinha = c.id
            WHERE e.data >= date('now', '-30 day')
            GROUP BY e.id
            ORDER BY e.data ASC, e.horario ASC
        `).all();

        if (missasDisponiveis.length === 0) {
            return alert("Não há escalas montadas para exportar!");
        }

        const pendentes   = missasDisponiveis.filter(m => m.total_com_presenca === 0);
        const concluidas  = missasDisponiveis.filter(m => m.total_com_presenca  >  0);

        const lista = document.getElementById('export_lista_missas');
        lista.innerHTML = '';

        function renderizarCardMissa(m, concluida) {
            const nomesMeses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
            const [ano, mes, dia] = m.data.split('-');
            const mesNome  = nomesMeses[parseInt(mes) - 1];
            const nomeMissa = m.titulo || m.igreja;

            return `
                <label class="flex items-center gap-3 p-3 rounded-xl border ${concluida ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 hover:border-emerald-400 hover:bg-emerald-50'} cursor-pointer transition-all" id="label_export_${m.id}">
                    <input type="checkbox" value="${m.id}" class="export-missa-check w-4 h-4 accent-emerald-600 flex-none"
                           onchange="atualizarContadorExport()">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-black text-gray-800">${nomeMissa}</span>
                            ${concluida
                                ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✅ Frequência feita</span>`
                                : `<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">${m.total_escalados} membro(s)</span>`
                            }
                        </div>
                        <p class="text-[10px] text-gray-400 font-bold mt-0.5">${dia}/${mesNome}/${ano} às ${m.horario} · ${m.igreja}</p>
                    </div>
                </label>`;
        }

        if (pendentes.length > 0) {
            lista.innerHTML += `<p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 mt-1">Pendentes</p>`;
            pendentes.forEach(m => { lista.innerHTML += renderizarCardMissa(m, false); });
        } else {
            lista.innerHTML += `
                <div class="text-center py-4 text-xs text-gray-400 font-bold bg-gray-50 rounded-xl">
                    ✅ Todas as escalas já têm frequência registrada.
                </div>`;
        }

        if (concluidas.length > 0) {
            lista.innerHTML += `
                <div class="mt-3">
                    <button type="button" onclick="toggleHistoricoExport()"
                        class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors w-full text-left">
                        <i id="icone_historico_export" class="fas fa-chevron-right text-[8px]"></i>
                        Histórico — ${concluidas.length} missa(s) já concluída(s)
                    </button>
                    <div id="historico_export" class="hidden flex flex-col gap-1.5 mt-2">
                        ${concluidas.map(m => renderizarCardMissa(m, true)).join('')}
                    </div>
                </div>`;
        }

        atualizarContadorExport();
        document.getElementById('modalExportarFrequencia').classList.remove('hidden');

    } catch (err) {
        alert("Erro ao carregar missas: " + err.message);
    }
}

function toggleHistoricoExport() {
    const painel = document.getElementById('historico_export');
    const icone  = document.getElementById('icone_historico_export');
    const aberto = !painel.classList.contains('hidden');
    painel.classList.toggle('hidden', aberto);
    icone.classList.toggle('fa-chevron-right', aberto);
    icone.classList.toggle('fa-chevron-down',  !aberto);
}

function atualizarContadorExport() {
    const checks = document.querySelectorAll('.export-missa-check:checked');
    const btn = document.getElementById('btn_confirmar_export');
    const contador = document.getElementById('export_contador');
    contador.innerText = checks.length > 0 ? `${checks.length} missa(s) selecionada(s)` : 'Nenhuma selecionada';
    btn.disabled = checks.length === 0;
    btn.classList.toggle('opacity-50', checks.length === 0);
    btn.classList.toggle('cursor-not-allowed', checks.length === 0);
}

function selecionarTodasMissasExport(selecionar) {
    document.querySelectorAll('.export-missa-check').forEach(c => c.checked = selecionar);
    atualizarContadorExport();
}

function confirmarExportacaoFrequencia() {
    try {
        const idsSelecionados = [...document.querySelectorAll('.export-missa-check:checked')].map(c => parseInt(c.value));
        if (idsSelecionados.length === 0) return;

        const placeholders = idsSelecionados.map(() => '?').join(',');

        const dadosNormais = db.prepare(`
            SELECT e.id as id_evento, e.data as Data, e.horario as Horario, e.igreja as Missa,
                   c.nome as Coroinha, esc.funcao_temp as Funcao, '' as Presenca
            FROM eventos e
            JOIN escalas esc ON e.id = esc.id_evento
            JOIN coroinhas c ON esc.id_coroinha = c.id
            WHERE e.id IN (${placeholders}) AND (e.todos_convocados IS NULL OR e.todos_convocados = 0)
            ORDER BY e.data ASC, e.horario ASC, esc.posicao_vaga ASC
        `).all(...idsSelecionados);

        const eventosTodos = db.prepare(`
            SELECT id, data, horario, igreja FROM eventos
            WHERE id IN (${placeholders}) AND todos_convocados = 1
        `).all(...idsSelecionados);

        const dadosTodos = [];
        eventosTodos.forEach(ev => {
            const todos = db.prepare(`SELECT nome, ${colunaTipo} as Funcao FROM coroinhas ORDER BY nome ASC`).all();
            todos.forEach(c => {
                dadosTodos.push({
                    Data: ev.data,
                    Horario: ev.horario,
                    Missa: ev.igreja,
                    Coroinha: c.nome,
                    Funcao: c.Funcao || 'Coroinha',
                    Presenca: ''
                });
            });
        });

        const dadosParaExportar = [...dadosTodos, ...dadosNormais];

        if (dadosParaExportar.length === 0) return alert("Nenhum dado encontrado para as missas selecionadas.");

        dadosParaExportar.forEach(d => {
            if (!d.Funcao) d.Funcao = 'Apoio';
            d.Data = d.Data.split('-').reverse().join('/');
        });

        const worksheet = XLSX.utils.json_to_sheet(dadosParaExportar);

        const wscols = [
            { wch: 10 }, { wch: 12 }, { wch: 8  }, { wch: 20 },
            { wch: 28 }, { wch: 16 }, { wch: 10 },
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Frequencia");

        const { ipcRenderer } = require('electron');
        const fs = require('fs');

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

        const { dialog } = require('@electron/remote') || require('electron').remote || {};

        if (dialog) {
            dialog.showSaveDialog({
                title: 'Salvar Planilha de Frequência',
                defaultPath: `Frequencia_Carire_${new Date().toISOString().slice(0,10)}.xlsx`,
                filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }]
            }).then(result => {
                if (!result.canceled && result.filePath) {
                    fs.writeFileSync(result.filePath, buffer);
                    fecharModal('modalExportarFrequencia');
                    alert(`✅ Planilha salva!\nPreencha a coluna "Presenca" com P (Presente) ou F (Falta) e importe de volta.`);
                }
            });
        } else {
            const path = require('path');
            const nomeArquivo = `Frequencia_Carire_${new Date().toISOString().slice(0,10)}.xlsx`;
            const caminhoSalvar = path.join(require('electron').remote
                ? require('electron').remote.app.getPath('downloads')
                : (process.env.USERPROFILE || process.env.HOME || '.'), nomeArquivo);
            fs.writeFileSync(caminhoSalvar, buffer);
            fecharModal('modalExportarFrequencia');
            alert(`✅ Planilha salva em:\n${caminhoSalvar}\n\nPreencha a coluna "Presenca" com P (Presente) ou F (Falta) e importe de volta.`);
        }

    } catch (err) {
        try {
            const dadosParaExportar = (() => {
                const idsSelecionados = [...document.querySelectorAll('.export-missa-check:checked')].map(c => parseInt(c.value));
                const placeholders = idsSelecionados.map(() => '?').join(',');
                return db.prepare(`
                    SELECT esc.id as ID_Escala, e.data as Data, e.horario as Horario, e.igreja as Missa,
                           c.nome as Coroinha, esc.funcao_temp as Funcao, '' as Presenca
                    FROM eventos e JOIN escalas esc ON e.id = esc.id_evento
                    JOIN coroinhas c ON esc.id_coroinha = c.id
                    WHERE e.id IN (${placeholders}) ORDER BY e.data ASC, e.horario ASC
                `).all(...idsSelecionados);
            })();
            dadosParaExportar.forEach(d => { if (!d.Funcao) d.Funcao = 'Apoio'; d.Data = d.Data.split('-').reverse().join('/'); });
            const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Frequencia");
            const nomeArq = `Frequencia_Carire_${new Date().toISOString().slice(0,10)}.xlsx`;
            XLSX.writeFile(wb, nomeArq);
            fecharModal('modalExportarFrequencia');
            alert(`✅ Planilha gerada: ${nomeArq}\nPreencha "Presenca" com P ou F e importe de volta.`);
        } catch(err2) {
            alert("Erro ao exportar: " + err2.message);
        }
    }
}

let dadosPreviewFrequencia = [];

function importarFrequenciaExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonDados = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            if (jsonDados.length === 0) return alert("A planilha está vazia ou em formato inválido.");

            dadosPreviewFrequencia = jsonDados.map(l => ({
                ID_Escala: l.ID_Escala || null,
                Missa:     l.Missa    || '—',
                Data:      l.Data     || '—',
                Coroinha:  l.Coroinha || '—',
                Funcao:    l.Funcao   || 'Apoio',
                Presenca:  String(l.Presenca || '').toUpperCase().trim(),
                _extra:    false
            }));

            abrirModalPreviewFrequencia();
        } catch (err) {
            alert("Erro ao ler planilha: " + err.message);
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
}

function abrirModalPreviewFrequencia() {
    renderizarTabelaPreview();
    document.getElementById('modalPreviewFrequencia').classList.remove('hidden');
}

function renderizarTabelaPreview() {
    const tbody = document.getElementById('preview_freq_tbody');
    tbody.innerHTML = '';

    dadosPreviewFrequencia.forEach((linha, idx) => {
        const isP = linha.Presenca === 'P';
        const isF = linha.Presenca === 'F';
        const corLinha = isP ? 'bg-emerald-50' : isF ? 'bg-red-50' : 'bg-white';
        const tagExtra = linha._extra
            ? `<span class="ml-1 text-[9px] font-black bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded uppercase">Extra</span>`
            : '';

        tbody.innerHTML += `
            <tr class="${corLinha} border-b border-gray-100 transition-colors" id="prev_row_${idx}">
                <td class="py-2 px-3 text-xs text-gray-500 font-bold">${linha.Data}</td>
                <td class="py-2 px-3 text-xs font-black text-gray-800">${linha.Coroinha}${tagExtra}</td>
                <td class="py-2 px-3 text-xs text-gray-500">${linha.Funcao}</td>
                <td class="py-2 px-3 text-xs text-gray-500">${linha.Missa}</td>
                <td class="py-2 px-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="setPresencaPreview(${idx},'P')"
                            class="px-2 py-1 rounded font-black text-[10px] border transition-all
                            ${isP ? 'bg-emerald-500 text-white border-emerald-600 shadow' : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'}">
                            P
                        </button>
                        <button onclick="setPresencaPreview(${idx},'F')"
                            class="px-2 py-1 rounded font-black text-[10px] border transition-all
                            ${isF ? 'bg-red-500 text-white border-red-600 shadow' : 'bg-white text-red-500 border-red-300 hover:bg-red-50'}">
                            F
                        </button>
                        ${linha._extra ? `<button onclick="removerLinhaPreview(${idx})" class="text-gray-300 hover:text-red-500 ml-1 transition-colors"><i class="fas fa-times text-xs"></i></button>` : ''}
                    </div>
                </td>
            </tr>`;
    });

    const total  = dadosPreviewFrequencia.length;
    const presentes = dadosPreviewFrequencia.filter(l => l.Presenca === 'P').length;
    const faltantes = dadosPreviewFrequencia.filter(l => l.Presenca === 'F').length;
    const semResposta = total - presentes - faltantes;
    document.getElementById('prev_count_total').innerText    = total;
    document.getElementById('prev_count_pres').innerText     = presentes;
    document.getElementById('prev_count_falt').innerText     = faltantes;
    document.getElementById('prev_count_pend').innerText     = semResposta;
}

function setPresencaPreview(idx, valor) {
    dadosPreviewFrequencia[idx].Presenca = dadosPreviewFrequencia[idx].Presenca === valor ? '' : valor;
    renderizarTabelaPreview();
}

function removerLinhaPreview(idx) {
    dadosPreviewFrequencia.splice(idx, 1);
    renderizarTabelaPreview();
}

function adicionarMembroExtraFrequencia() {
    const missasUnicas = [...new Set(dadosPreviewFrequencia.map(l => l.Missa + '||' + l.Data))];
    let optsMissa = missasUnicas.map(m => {
        const [missa, data] = m.split('||');
        return `<option value="${m}">${data} — ${missa}</option>`;
    }).join('');

    const missaSel   = document.getElementById('extra_freq_missa');
    const nomeInput  = document.getElementById('extra_freq_nome');
    const funcInput  = document.getElementById('extra_freq_funcao');

    if (missaSel) missaSel.innerHTML = optsMissa || '<option value="">—</option>';
    if (nomeInput) nomeInput.value  = '';
    if (funcInput) funcInput.value  = '';

    document.getElementById('painel_extra_freq').classList.toggle('hidden');
}

function confirmarMembroExtraFrequencia() {
    const missaVal = document.getElementById('extra_freq_missa').value;
    const nome     = document.getElementById('extra_freq_nome').value.trim();
    const funcao   = document.getElementById('extra_freq_funcao').value.trim() || 'Apoio';

    if (!nome) return alert("Informe o nome do membro.");

    const [missa, data] = missaVal.split('||');
    dadosPreviewFrequencia.push({
        ID_Escala: null,
        Missa:     missa || '—',
        Data:      data  || '—',
        Coroinha:  nome,
        Funcao:    funcao,
        Presenca:  'P',
        _extra:    true
    });

    document.getElementById('painel_extra_freq').classList.add('hidden');
    renderizarTabelaPreview();
}

function confirmarImportacaoFrequencia() {
    try {
        const updateStmt = db.prepare(`UPDATE escalas SET presente = ? WHERE id = ?`);
        const insertEscalaStmt = db.prepare(`
            INSERT INTO escalas (id_evento, id_coroinha, posicao_vaga, funcao_temp, presente)
            VALUES (?, ?, ?, ?, ?)
        `);

        let atualizados       = 0;
        let extrasAdicionados = 0;
        let extrasIgnorados   = 0;

        db.transaction(() => {
            for (const linha of dadosPreviewFrequencia) {
                const presVal = linha.Presenca === 'P' ? 1 : linha.Presenca === 'F' ? 0 : null;
                if (presVal === null) continue;

                if (!linha._extra && linha.ID_Escala) {
                    updateStmt.run(presVal, linha.ID_Escala);
                    atualizados++;
                } else if (linha._extra) {
                    const [missaNome, dataStr] = (linha.Missa + '||' + linha.Data).split('||');
                    const partes = (dataStr || '').split('/');
                    const dataISO = partes.length === 3 ? `${partes[2]}-${partes[1]}-${partes[0]}` : null;
                    if (!dataISO) continue;

                    const evento = db.prepare(`SELECT id FROM eventos WHERE data = ? AND igreja = ? LIMIT 1`).get(dataISO, missaNome);
                    if (!evento) continue;

                    const coroinha = db.prepare(`SELECT id FROM coroinhas WHERE nome = ? LIMIT 1`).get(linha.Coroinha);

                    if (!coroinha) {
                        extrasIgnorados++;
                        continue;
                    }

                    const escalaExistente = db.prepare(
                        `SELECT id FROM escalas WHERE id_evento = ? AND id_coroinha = ? LIMIT 1`
                    ).get(evento.id, coroinha.id);

                    if (escalaExistente) {
                        updateStmt.run(presVal, escalaExistente.id);
                    } else {
                        const posicao = 900 + (extrasAdicionados % 100);
                        insertEscalaStmt.run(evento.id, coroinha.id, posicao, linha.Funcao || 'Apoio', presVal);
                    }
                    extrasAdicionados++;
                }
            }
        })();

        fecharModal('modalPreviewFrequencia');
        dadosPreviewFrequencia = [];
        carregarDadosDashboard();
        popularFiltroMeses();

        let msg = `✅ ${atualizados} presenças registradas.`;
        if (extrasAdicionados > 0) msg += `\n➕ ${extrasAdicionados} membro(s) extra(s) com presença registrada.`;
        if (extrasIgnorados   > 0) msg += `\n⚠️ ${extrasIgnorados} membro(s) não encontrado(s) no cadastro — verifique o nome e tente novamente.`;
        alert(msg);

    } catch (err) {
        alert("Erro ao confirmar frequência: " + err.message);
    }
}

// ==========================================
// COROINHAS (LISTA, CADASTRO, EDIÇÃO) E NOVA CONTAGEM
// ==========================================
function salvarCoroinha(event) {
    event.preventDefault();
    const nome       = document.getElementById('cad_nome').value.trim();
    const tipo       = document.getElementById('cad_tipo').value;
    const nascimento = document.getElementById('cad_nascimento').value || null;
    try {
        db.prepare(`INSERT INTO coroinhas (nome, ${colunaTipo}, data_nascimento) VALUES (?, ?, ?)`).run(nome, tipo, nascimento);
        alert("Cadastrado com sucesso!");
        document.getElementById('form_cadastro').reset();
        mudarAba('lista');
    } catch(err) { alert("Erro ao salvar: " + err.message); }
}

function listarCoroinhas() {
    const tbodyMestres = document.getElementById('tabela_mestres');
    const tbodyCoroinhas = document.getElementById('tabela_coroinhas_lista');
    
    // Limpa as tabelas antes de popular
    if(tbodyMestres) tbodyMestres.innerHTML = '';
    if(tbodyCoroinhas) tbodyCoroinhas.innerHTML = '';

    const lista = db.prepare(`SELECT * FROM coroinhas ORDER BY nome ASC`).all();
    
    // Filtra os grupos
    const listaMestres = lista.filter(c => (c[colunaTipo] || '').toLowerCase() === 'mestre');
    const listaCoroinhas = lista.filter(c => (c[colunaTipo] || '').toLowerCase() !== 'mestre');
    
    // Atualiza os marcadores de contagem no topo
    const elResumoTotal = document.getElementById('resumo_total');
    const elResumoMestres = document.getElementById('resumo_mestres');
    const elResumoCoroinhas = document.getElementById('resumo_coroinhas');
    
    if(elResumoTotal) elResumoTotal.innerText = lista.length;
    if(elResumoMestres) elResumoMestres.innerText = listaMestres.length;
    if(elResumoCoroinhas) elResumoCoroinhas.innerText = listaCoroinhas.length;

    // --- Renderiza Tabela de Mestres ---
    if (listaMestres.length === 0) {
        tbodyMestres.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-xs font-bold text-amber-600/50">Nenhum mestre cadastrado.</td></tr>`;
    } else {
        listaMestres.forEach(c => {
            tbodyMestres.innerHTML += `
                <tr class="hover:bg-amber-50/50 transition-colors">
                    <td class="py-3 px-6 text-xs text-amber-500 font-bold">#${c.id}</td>
                    <td class="py-3 px-6 text-gray-800 font-black">${c.nome}</td>
                    <td class="py-3 px-6 text-center flex justify-center gap-3">
                        <button onclick="editarCoroinha(${c.id})" class="text-blue-500 hover:text-blue-700 transition-colors"><i class="fas fa-edit"></i></button>
                        <button onclick="deletarCoroinha(${c.id})" class="text-red-500 hover:text-red-700 transition-colors"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });
    }

    // --- Renderiza Tabela de Coroinhas ---
    if (listaCoroinhas.length === 0) {
        tbodyCoroinhas.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-xs font-bold text-emerald-600/50">Nenhum coroinha cadastrado.</td></tr>`;
    } else {
        listaCoroinhas.forEach(c => {
            tbodyCoroinhas.innerHTML += `
                <tr class="hover:bg-emerald-50/50 transition-colors">
                    <td class="py-3 px-6 text-xs text-emerald-500 font-bold">#${c.id}</td>
                    <td class="py-3 px-6 text-gray-800 font-black">${c.nome}</td>
                    <td class="py-3 px-6 text-center flex justify-center gap-3">
                        <button onclick="editarCoroinha(${c.id})" class="text-blue-500 hover:text-blue-700 transition-colors"><i class="fas fa-edit"></i></button>
                        <button onclick="deletarCoroinha(${c.id})" class="text-red-500 hover:text-red-700 transition-colors"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
        });
    }
}

function deletarCoroinha(id) {
    if (!confirm("Excluir membro? Isso apagará as escalas dele.")) return;
    try {
        db.prepare(`DELETE FROM escalas WHERE id_coroinha = ?`).run(id);
        db.prepare(`DELETE FROM coroinhas WHERE id = ?`).run(id);
        listarCoroinhas();
    } catch(err) { alert("Erro: " + err.message); }
}

function editarCoroinha(id) {
    const c = db.prepare(`SELECT * FROM coroinhas WHERE id = ?`).get(id);
    document.getElementById('edit_cad_id').value = c.id;
    document.getElementById('edit_cad_nome').value = c.nome;
    document.getElementById('edit_cad_nascimento').value = c.data_nascimento || '';
    const selectTipo = document.getElementById('edit_cad_tipo');
    const valorTipo  = c[colunaTipo] || 'Coroinha';
    if ([...selectTipo.options].some(o => o.value === valorTipo)) {
        selectTipo.value = valorTipo;
    } else {
        selectTipo.innerHTML += `<option value="${valorTipo}">${valorTipo}</option>`;
        selectTipo.value = valorTipo;
    }
    document.getElementById('modalEditarCoroinha').classList.remove('hidden');
}

function salvarEdicaoCoroinha(event) {
    event.preventDefault();
    const id         = document.getElementById('edit_cad_id').value;
    const nome       = document.getElementById('edit_cad_nome').value.trim();
    const tipo       = document.getElementById('edit_cad_tipo').value;
    const nascimento = document.getElementById('edit_cad_nascimento').value || null;
    try {
        db.prepare(`UPDATE coroinhas SET nome = ?, ${colunaTipo} = ?, data_nascimento = ? WHERE id = ?`).run(nome, tipo, nascimento, id);
        fecharModal('modalEditarCoroinha');
        listarCoroinhas();
    } catch(err) { alert("Erro ao atualizar: " + err.message); }
}

function importarMembrosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const json = XLSX.utils.sheet_to_json(XLSX.read(data, { type: 'array' }).Sheets[workbook.SheetNames[0]]);
            let ins = 0;
            db.transaction((linhas) => {
                for (let l of linhas) {
                    if (l.Nome) {
                        const tipoExcel = l.Tipo || l.Cargo || l.Funcao || 'Coroinha';
                        db.prepare(`INSERT INTO coroinhas (nome, ${colunaTipo}) VALUES (?, ?)`).run(l.Nome.trim(), tipoExcel.trim());
                        ins++;
                    }
                }
            })(json);
            alert(`${ins} membros importados.`);
            listarCoroinhas();
        } catch (err) { alert("Erro na planilha."); }
        finally { event.target.value = ""; }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// CALENDÁRIO MENSAL E DEMAIS FUNÇÕES
// ==========================================
let dataFocoCalendario = new Date();

function mudarMesCalendario(direcao) {
    dataFocoCalendario.setMonth(dataFocoCalendario.getMonth() + direcao);
    renderizarGradeCalendario();
}

function renderizarGradeCalendario() {
    const ano = dataFocoCalendario.getFullYear();
    const mes = dataFocoCalendario.getMonth();
    const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById('titulo_mes_calendario').innerText = `${nomesMeses[mes]} ${ano}`;

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    
    const mesFormatado = String(mes + 1).padStart(2, '0');
    const filtroData = `${ano}-${mesFormatado}-%`;
    const eventosDoMes = db.prepare(`SELECT * FROM eventos WHERE data LIKE ? ORDER BY data ASC, horario ASC`).all(filtroData);

    const grade = document.getElementById('grade_calendario');
    grade.innerHTML = '';

    for (let i = 0; i < primeiroDia; i++) {
        grade.innerHTML += `<div class="calendario-cell vazio"></div>`;
    }

    const hoje = new Date();
    for (let dia = 1; dia <= totalDias; dia++) {
        const isHoje = (dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear());
        const dataDia = `${ano}-${mesFormatado}-${String(dia).padStart(2, '0')}`;
        
        const missasHoje = eventosDoMes.filter(e => e.data === dataDia);
        
        let badgesHTML = '';
        missasHoje.forEach(missa => {
            const exibir  = (missa.titulo && missa.titulo.trim()) ? missa.titulo.trim() : missa.igreja;
            const corBg    = missa.cor_bg    || '#dcfce7';
            const corTexto = missa.cor_texto || '#166534';
            const corBorda = missa.cor_borda || '#bbf7d0';
            badgesHTML += `
                <div onclick="abrirAcoesEvento(${missa.id})"
                     style="background:${corBg}; color:${corTexto}; border:1px solid ${corBorda}; font-size:12px; padding:3px 5px; border-radius:5px; font-weight:700; cursor:pointer; white-space:normal; word-break:break-word; line-height:1.3;"
                     onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter=''">
                    ${missa.horario} - ${exibir}
                </div>`;
        });

        grade.innerHTML += `
            <div class="calendario-cell ${isHoje ? 'hoje border-2 border-emerald-400' : ''}">
                <span class="text-xs font-bold ${isHoje ? 'text-emerald-600' : 'text-gray-500'} block text-right pr-1">${dia}</span>
                <div class="flex flex-col gap-1 overflow-y-auto mt-1 custom-scrollbar">${badgesHTML}</div>
            </div>`;
    }

    const celulasTotais = primeiroDia + totalDias;
    const celulasFaltantes = (Math.ceil(celulasTotais / 7) * 7) - celulasTotais;
    for (let i = 0; i < celulasFaltantes; i++) {
        grade.innerHTML += `<div class="calendario-cell vazio"></div>`;
    }
}

function abrirModalCriarEvento() {
    document.getElementById('form_evento').reset();
    document.getElementById('evt_id').value = '';
    document.getElementById('titulo_modal_evento').innerText = 'Agendar Missa';
    sincronizarCamposLocal();
    selecionarCorEvento('#166534','#ffffff','#14532d'); 
    document.getElementById('modalEvento').classList.remove('hidden');
}

function sincronizarCamposLocal() {
    const igreja     = document.getElementById('evt_igreja');
    const localLivre = document.getElementById('evt_local_livre');
    const lblOpc     = document.getElementById('lbl_local_opcional');

    const temIgreja  = igreja.value.trim() !== '';
    const temLocal   = localLivre.value.trim() !== '';

    if (temLocal) {
        igreja.removeAttribute('required');
        igreja.classList.remove('bg-gray-50', 'border-gray-200');
        igreja.classList.add('bg-gray-50');
        lblOpc && (lblOpc.textContent = '');
        document.getElementById('lbl_evt_igreja').innerHTML =
            'Igreja Principal <span class="normal-case font-normal text-gray-400">(opcional)</span>';
    } else {
        igreja.setAttribute('required', '');
        lblOpc && (lblOpc.textContent = '(opcional)');
        document.getElementById('lbl_evt_igreja').innerText = 'Igreja Principal';
    }
}

function selecionarCorEvento(bg, texto, borda) {
    document.getElementById('evt_cor_bg').value   = bg;
    document.getElementById('evt_cor_texto').value = texto;
    document.getElementById('evt_cor_borda').value = borda;
    document.querySelectorAll('.cor-btn').forEach(btn => {
        btn.style.borderColor = 'transparent';
        btn.style.transform   = 'scale(1)';
        btn.style.outline     = 'none';
    });
    const sel = document.querySelector(`.cor-btn[data-cor="${bg}"]`);
    if (sel) {
        sel.style.borderColor = '#1f2937';
        sel.style.transform   = 'scale(1.3)';
        sel.style.outline     = '2px solid #1f2937';
    }
}

function selecionarCorEventoPorBg(bg) {
    const mapa = {
        '#166534':['#166534','#ffffff','#14532d'],
        '#1d4ed8':['#1d4ed8','#ffffff','#1e3a8a'],
        '#b45309':['#b45309','#ffffff','#92400e'],
        '#be185d':['#be185d','#ffffff','#9d174d'],
        '#7c3aed':['#7c3aed','#ffffff','#5b21b6'],
        '#ea580c':['#ea580c','#ffffff','#c2410c'],
        '#dc2626':['#dc2626','#ffffff','#991b1b'],
        '#475569':['#475569','#ffffff','#334155'],
        '#dcfce7':['#166534','#ffffff','#14532d'],
        '#dbeafe':['#1d4ed8','#ffffff','#1e3a8a'],
        '#fef9c3':['#b45309','#ffffff','#92400e'],
        '#fce7f3':['#be185d','#ffffff','#9d174d'],
        '#ede9fe':['#7c3aed','#ffffff','#5b21b6'],
        '#ffedd5':['#ea580c','#ffffff','#c2410c'],
        '#fee2e2':['#dc2626','#ffffff','#991b1b'],
        '#f1f5f9':['#475569','#ffffff','#334155'],
    };
    const c = mapa[bg] || mapa['#166534'];
    selecionarCorEvento(...c);
}

function salvarEvento(event) {
    event.preventDefault();
    const id         = document.getElementById('evt_id').value;
    const data       = document.getElementById('evt_data').value;
    const horario    = document.getElementById('evt_horario').value;
    const igreja     = document.getElementById('evt_igreja').value.trim();
    const local_livre = document.getElementById('evt_local_livre').value.trim();
    const titulo     = document.getElementById('evt_funcao_extra').value.trim();
    const cor_bg     = document.getElementById('evt_cor_bg').value    || '#166534';
    const cor_texto  = document.getElementById('evt_cor_texto').value  || '#ffffff';
    const cor_borda  = document.getElementById('evt_cor_borda').value  || '#14532d';

    try {
        const local_final = local_livre !== '' ? local_livre : igreja;
        if (!local_final) return alert("Informe ao menos o local da missa (Igreja Principal ou Outro Local).");
        if (!titulo) return alert("Informe o nome da Missa / Solenidade.\nEx: Pentecostes, 3º Domingo do Tempo Comum...");

        let idEvento;
        if (id) {
            db.prepare(`UPDATE eventos SET data=?, horario=?, igreja=?, titulo=?, cor_bg=?, cor_texto=?, cor_borda=?, qtd_coroinhas=0 WHERE id=?`)
              .run(data, horario, local_final, titulo, cor_bg, cor_texto, cor_borda, id);
            idEvento = parseInt(id);
        } else {
            const result = db.prepare(`INSERT INTO eventos (data, horario, igreja, titulo, cor_bg, cor_texto, cor_borda, qtd_coroinhas) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
              .run(data, horario, local_final, titulo, cor_bg, cor_texto, cor_borda);
            idEvento = result.lastInsertRowid;
        }
        fecharModal('modalEvento');
        renderizarGradeCalendario();
        popularFiltroMeses();
        setTimeout(() => abrirModalEscala(idEvento), 80);
    } catch(err) { alert("Erro ao salvar missa: " + err.message); }
}

let idEventoAcoesModal = null;

function abrirAcoesEvento(id) {
    idEventoAcoesModal = id;
    const e = db.prepare(`SELECT * FROM eventos WHERE id = ?`).get(id);
    document.getElementById('acoes_titulo_evento').innerText = e.igreja;
    const dataFormatada = e.data.split('-').reverse().join('/');
    document.getElementById('acoes_subtitulo_evento').innerText = `${dataFormatada} às ${e.horario}`;
    document.getElementById('modalAcoesEvento').classList.remove('hidden');
}

function executarAcaoEvento(acao) {
    fecharModal('modalAcoesEvento');
    if (!idEventoAcoesModal) return;
    
    if (acao === 'escalar') abrirModalEscala(idEventoAcoesModal);
    else if (acao === 'editar') editarEvento(idEventoAcoesModal);
    else if (acao === 'compartilhar') abrirModalCompartilhar(idEventoAcoesModal);
    else if (acao === 'apagar') deletarEvento(idEventoAcoesModal);
}

function abrirEdicaoDoModal() {
    if (!idEventoSelecionadoModal) return;
    fecharModal('modalEscala');
    editarEvento(idEventoSelecionadoModal);
}

function editarEvento(id) {
    const e = db.prepare(`SELECT * FROM eventos WHERE id = ?`).get(id);
    document.getElementById('evt_id').value = e.id;
    document.getElementById('evt_data').value = e.data;
    document.getElementById('evt_horario').value = e.horario;
    document.getElementById('evt_igreja').value = e.igreja;
    document.getElementById('evt_local_livre').value = '';
    document.getElementById('evt_funcao_extra').value = e.titulo || '';
    document.getElementById('titulo_modal_evento').innerText = 'Editar Missa';
    sincronizarCamposLocal();
    selecionarCorEventoPorBg(e.cor_bg || '#dcfce7');
    document.getElementById('modalEvento').classList.remove('hidden');
}

function deletarEvento(id) {
    if (!confirm("Excluir esta missa apagará toda a escala montada nela. Confirmar?")) return;
    try {
        db.prepare(`DELETE FROM escalas WHERE id_evento = ?`).run(id);
        db.prepare(`DELETE FROM eventos WHERE id = ?`).run(id);
        renderizarGradeCalendario();
    } catch(err) { alert("Erro ao excluir: " + err.message); }
}

let idEventoSelecionadoModal = null;
let _contadorVagas = 0; 

function _buildOptionsHtml(coroinhas, idSelecionado) {
    let html = `<option value="">— Selecionar —</option>`;
    const mestres   = coroinhas.filter(c => (c[colunaTipo] || '').toLowerCase() === 'mestre');
    const restantes = coroinhas.filter(c => (c[colunaTipo] || '').toLowerCase() !== 'mestre');
    if (mestres.length) html += `<optgroup label="── Mestres ──">` +
        mestres.map(c => `<option value="${c.id}"${c.id == idSelecionado ? ' selected' : ''}>${c.nome}</option>`).join('') + `</optgroup>`;
    if (restantes.length) html += `<optgroup label="── Coroinhas ──">` +
        restantes.map(c => `<option value="${c.id}"${c.id == idSelecionado ? ' selected' : ''}>${c.nome}</option>`).join('') + `</optgroup>`;
    return html;
}

function _criarLinhaVaga(idVaga, posicao, funcaoNome, coroinhas, idSelecionado) {
    return `
        <div class="vaga-row flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 group"
             data-posicao="${posicao}" data-id-vaga="${idVaga}">
            <i class="fas fa-grip-vertical text-gray-300 text-xs flex-none"></i>
            <input type="text"
                value="${funcaoNome}"
                placeholder="Função (ex: Turiferário, Apoio...)"
                class="input-funcao-vaga flex-1 min-w-0 text-[11px] font-black text-gray-600 uppercase bg-transparent
                       border-b border-transparent focus:border-emerald-400 focus:outline-none py-0.5 tracking-wide
                       placeholder:normal-case placeholder:font-normal placeholder:text-gray-300"
                oninput="this.closest('.vaga-row').querySelector('.select-vaga-escala').setAttribute('data-funcao', this.value)">
            <select data-funcao="${funcaoNome}" data-posicao="${posicao}"
                class="select-vaga-escala text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200
                       rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none w-44 flex-none">
                ${_buildOptionsHtml(coroinhas, idSelecionado)}
            </select>
            <button onclick="removerVagaEscala(${idVaga})"
                class="flex-none text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                <i class="fas fa-times-circle"></i>
            </button>
        </div>`;
}

function adicionarVagaEscala(funcaoNome, idSelecionado) {
    _contadorVagas++;
    const idVaga  = Date.now() + _contadorVagas;
    const posicao = idVaga;
    const coroinhas = db.prepare(`SELECT id, nome, ${colunaTipo} FROM coroinhas ORDER BY nome ASC`).all();

    const btnAdicionar = document.getElementById('btn_adicionar_vaga');
    const containerBotoes = btnAdicionar.closest('.flex.gap-2.mt-1') || btnAdicionar.parentNode;
    const div = document.createElement('div');
    div.innerHTML = _criarLinhaVaga(idVaga, posicao, funcaoNome || '', coroinhas, idSelecionado || '');
    containerBotoes.parentNode.insertBefore(div.firstElementChild, containerBotoes);

    const novaRow = document.querySelector(`.vaga-row[data-id-vaga="${idVaga}"]`);
    if (novaRow && !funcaoNome) novaRow.querySelector('.input-funcao-vaga').focus();
}

function removerVagaEscala(idVaga) {
    const row = document.querySelector(`.vaga-row[data-id-vaga="${idVaga}"]`);
    if (row) row.remove();
}

function abrirModalEscala(idEvento) {
    idEventoSelecionadoModal = idEvento;
    _contadorVagas = 0;

    document.getElementById('modalEscala').classList.remove('hidden');

    const evento = db.prepare(`SELECT * FROM eventos WHERE id = ?`).get(idEvento);
    document.getElementById('modal_titulo_evento').innerText = evento.igreja;
    document.getElementById('modal_subtitulo_evento').innerText =
        `${evento.data.split('-').reverse().join('/')} às ${evento.horario}`;

    const coroinhas  = db.prepare(`SELECT id, nome, ${colunaTipo} FROM coroinhas ORDER BY nome ASC`).all();
    const escalaSalva = db.prepare(`SELECT * FROM escalas WHERE id_evento = ? ORDER BY posicao_vaga ASC`).all(idEvento);

    const container = document.getElementById('modal_container_vagas');
    container.innerHTML = '';

    if (evento.todos_convocados) {
        const total = db.prepare(`SELECT COUNT(*) as n FROM coroinhas`).get().n;
        container.innerHTML = `
            <div id="card_todos_convocados">
                <div class="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-300 mb-2">
                    <div class="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-none">
                        <i class="fas fa-users text-white text-sm"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-xs font-black text-amber-800">TODOS OS MEMBROS CONVOCADOS</p>
                        <p class="text-[10px] text-amber-600 font-bold mt-0.5">${total} membros ativos</p>
                    </div>
                    <button onclick="cancelarConvocacaoTodos()" class="text-amber-400 hover:text-red-500 transition-colors ml-2" title="Cancelar convocação geral">
                        <i class="fas fa-times-circle text-lg"></i>
                    </button>
                </div>
            </div>`;
    } else if (escalaSalva.length > 0) {
        escalaSalva.forEach(esc => {
            _contadorVagas++;
            const idVaga = Date.now() + _contadorVagas;
            container.innerHTML += _criarLinhaVaga(idVaga, esc.posicao_vaga, esc.funcao_temp || '', coroinhas, esc.id_coroinha);
        });
    }

    container.innerHTML += `
        <div class="flex gap-2 mt-1">
            <button id="btn_adicionar_vaga" onclick="adicionarVagaEscala()"
                class="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-200
                       text-gray-400 font-black text-xs py-3 rounded-xl hover:border-emerald-400 hover:text-emerald-600
                       hover:bg-emerald-50 transition-all">
                <i class="fas fa-plus-circle"></i> Adicionar Membro
            </button>
            <button onclick="convocarTodos()"
                class="flex items-center justify-center gap-2 border-2 border-dashed border-amber-300
                       text-amber-500 font-black text-xs py-3 px-4 rounded-xl hover:border-amber-500 hover:text-amber-700
                       hover:bg-amber-50 transition-all whitespace-nowrap">
                <i class="fas fa-users"></i> Convocar Todos
            </button>
        </div>`;

    if (escalaSalva.length === 0) adicionarVagaEscala();
}

function clonarEscalaAnterior() {
    if (!idEventoSelecionadoModal) return;

    const ultimaEscala = db.prepare(`
        SELECT esc.posicao_vaga, esc.id_coroinha, esc.funcao_temp
        FROM escalas esc
        JOIN eventos e ON esc.id_evento = e.id
        WHERE e.id != ?
        ORDER BY e.data DESC, e.horario DESC
        LIMIT 30
    `).all(idEventoSelecionadoModal);

    if (ultimaEscala.length === 0) return alert("Nenhuma escala anterior encontrada para copiar.");

    document.querySelectorAll('.vaga-row').forEach(r => r.remove());

    ultimaEscala.forEach(esc => {
        adicionarVagaEscala(esc.funcao_temp || '', esc.id_coroinha);
    });

    setTimeout(() => {
        const rows = document.querySelectorAll('.vaga-row');
        rows.forEach((row, i) => {
            if (ultimaEscala[i]) {
                const sel = row.querySelector('.select-vaga-escala');
                if (sel) sel.value = ultimaEscala[i].id_coroinha || '';
            }
        });
    }, 30);

    alert(`${ultimaEscala.length} vagas copiadas da missa anterior!`);
}

function convocarTodos() {
    if (!idEventoSelecionadoModal) return;
    const total = db.prepare(`SELECT COUNT(*) as n FROM coroinhas`).get().n;
    if (total === 0) return alert("Nenhum membro cadastrado no sistema.");
    if (!confirm(`Convocar todos os ${total} membros ativos para esta missa?\n\nA escala individual será limpa e substituída pela convocação geral.`)) return;
    db.prepare(`DELETE FROM escalas WHERE id_evento = ?`).run(idEventoSelecionadoModal);
    db.prepare(`UPDATE eventos SET todos_convocados = 1 WHERE id = ?`).run(idEventoSelecionadoModal);
    document.querySelectorAll(".vaga-row").forEach(r => r.remove());
    const container = document.getElementById("modal_container_vagas");
    const btnArea = container.querySelector(".flex.gap-2.mt-1") || container.lastElementChild;
    const cardAnterior = document.getElementById("card_todos_convocados");
    if (cardAnterior) cardAnterior.remove();
    const card = document.createElement("div");
    card.id = "card_todos_convocados";
    card.innerHTML = `<div class="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-300 mb-2"><div class="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-none"><i class="fas fa-users text-white text-sm"></i></div><div class="flex-1"><p class="text-xs font-black text-amber-800">TODOS OS MEMBROS CONVOCADOS</p><p class="text-[10px] text-amber-600 font-bold mt-0.5">${total} membros ativos</p></div><button onclick="cancelarConvocacaoTodos()" class="text-amber-400 hover:text-red-500 transition-colors ml-2" title="Cancelar convocação geral"><i class="fas fa-times-circle text-lg"></i></button></div>`;
    container.insertBefore(card, btnArea);
    renderizarGradeCalendario();
}

function cancelarConvocacaoTodos() {
    if (!idEventoSelecionadoModal) return;
    db.prepare(`UPDATE eventos SET todos_convocados = 0 WHERE id = ?`).run(idEventoSelecionadoModal);
    const card = document.getElementById("card_todos_convocados");
    if (card) card.remove();
    adicionarVagaEscala();
    renderizarGradeCalendario();
}


function salvarEscalaEquipe() {
    if (!idEventoSelecionadoModal) return;
    try {
        db.prepare(`DELETE FROM escalas WHERE id_evento = ?`).run(idEventoSelecionadoModal);
        const stmtInsert = db.prepare(
            `INSERT INTO escalas (id_evento, id_coroinha, posicao_vaga, funcao_temp) VALUES (?, ?, ?, ?)`
        );

        let posicaoSeq = 0;
        db.transaction(() => {
            document.querySelectorAll('.vaga-row').forEach(row => {
                const select   = row.querySelector('.select-vaga-escala');
                const inputFunc = row.querySelector('.input-funcao-vaga');
                if (!select || select.value === '') return; 
                const funcaoFinal = (inputFunc ? inputFunc.value.trim() : '') || 'Apoio';
                stmtInsert.run(idEventoSelecionadoModal, parseInt(select.value), posicaoSeq++, funcaoFinal);
            });
        })();

        const statusEl = document.getElementById('escala_status');
        if (statusEl) {
            statusEl.classList.remove('hidden');
            setTimeout(() => statusEl.classList.add('hidden'), 2500);
        }
        renderizarGradeCalendario();
    } catch(err) { alert("Erro ao salvar: " + err.message); }
}

function abrirModalCompartilhar(idEvento) {
    document.getElementById('modalCompartilhar').classList.remove('hidden');
    const e = db.prepare(`SELECT * FROM eventos WHERE id = ?`).get(idEvento);

    document.getElementById('img_igreja').innerText = e.igreja;
    document.getElementById('img_data').innerText =
        `${e.data.split('-').reverse().join('/')} às ${e.horario}`;

    const imgTitulo = document.getElementById('img_titulo');
    if (e.titulo && e.titulo.trim()) {
        imgTitulo.innerText = e.titulo.trim();
        imgTitulo.style.display = 'block';
    } else {
        imgTitulo.style.display = 'none';
    }

    const containerLista = document.getElementById('img_lista');

    if (e.todos_convocados) {
        const total = db.prepare(`SELECT COUNT(*) as n FROM coroinhas`).get().n;
        containerLista.style.display = 'block';
        containerLista.style.gridTemplateColumns = '';
        containerLista.style.gap = '';
        containerLista.style.width = '100%';
        containerLista.style.boxSizing = 'border-box';
        containerLista.innerHTML = `
            <div style="width:100%; box-sizing:border-box; border-radius:12px; overflow:hidden; border:2px solid #f59e0b; background:#fffbeb;">
                <div style="background:#f59e0b; padding:14px 18px; display:flex; align-items:center; gap:12px; width:100%; box-sizing:border-box;">
                    <div style="width:36px; height:36px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <span style="font-size:18px;">🙏</span>
                    </div>
                    <div>
                        <p style="font-size:13px; font-weight:900; color:#fff; font-family:sans-serif; margin:0; text-transform:uppercase; letter-spacing:0.05em;">Todos os Membros Convocados</p>
                        <p style="font-size:11px; color:#fef3c7; font-family:sans-serif; margin:3px 0 0 0; font-weight:600;">${total} membros ativos · Presença obrigatória</p>
                    </div>
                </div>
                <div style="padding:12px 18px; text-align:center; width:100%; box-sizing:border-box;">
                    <p style="font-size:11px; color:#92400e; font-family:sans-serif; font-weight:700; margin:0;">
                        Coroinhas e Mestres — comparecer com antecedência
                    </p>
                </div>
            </div>`;
        return;
    }

    const equipe = db.prepare(`
        SELECT esc.funcao_temp, c.nome
        FROM escalas esc
        JOIN coroinhas c ON esc.id_coroinha = c.id
        WHERE esc.id_evento = ?
        ORDER BY esc.posicao_vaga ASC
    `).all(idEvento);

    if (equipe.length === 0) {
        containerLista.style.display = 'block';
        containerLista.innerHTML = `
            <p style="text-align:center; color:#9ca3af; font-size:13px; font-weight:600; padding:24px 0; font-family:sans-serif;">
                Nenhum membro escalado.
            </p>`;
        return;
    }

    const cards = equipe.map(m => {
        const temFuncao = m.funcao_temp && m.funcao_temp.trim() !== '' && m.funcao_temp.trim().toLowerCase() !== 'apoio';
        return `
            <div style="display:flex; align-items:stretch; gap:0; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
                <div style="width:4px; background:#166534; flex-shrink:0; border-radius:8px 0 0 8px;"></div>
                <div style="flex:1; padding:10px 12px; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:48px;">
                    <span style="font-size:14px; font-weight:800; color:#1a202c; font-family:'Georgia',serif; text-align:center; line-height:1.2;">
                        ${m.nome}
                    </span>
                    ${temFuncao ? `
                    <span style="font-size:9px; font-weight:600; color:#6b7280; font-family:sans-serif;
                                  text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">
                        ${m.funcao_temp}
                    </span>` : ''}
                </div>
            </div>`;
    }).join('');

    containerLista.style.display = 'grid';
    containerLista.style.gridTemplateColumns = '1fr 1fr';
    containerLista.style.gap = '8px';
    containerLista.innerHTML = cards;
}

function copiarImagemEscalaZap() {
    const elemento = document.getElementById('bloco_escala_imagem');
    const zoomAtual = parseFloat(document.body.style.zoom) || 1.0;

    const igreja = document.getElementById('img_igreja').innerText || 'Escala';
    const data   = document.getElementById('img_data').innerText   || '';
    const dataSlug = data.replace(/\//g, '-').replace(/\s/g, '_').replace(/:/g, 'h');
    const nomeArquivo = `Escala_${igreja}_${dataSlug}.png`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    html2canvas(elemento, {
        scale: 4, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
        windowWidth: document.documentElement.scrollWidth / zoomAtual,
        windowHeight: document.documentElement.scrollHeight / zoomAtual,
        x: 0, y: 0, scrollX: 0, scrollY: 0,
        onclone: function(clonedDoc) {
            clonedDoc.body.style.zoom = '1';
            clonedDoc.body.style.transform = 'none';
            const blocoClone = clonedDoc.getElementById('bloco_escala_imagem');
            if (blocoClone) {
                blocoClone.style.position = 'relative';
                blocoClone.style.display = 'flex';
                blocoClone.style.flexDirection = 'column';
                blocoClone.style.width = '520px';
                blocoClone.style.backgroundColor = '#ffffff';
                blocoClone.style.borderRadius = '16px';
                blocoClone.style.overflow = 'hidden';
                blocoClone.style.boxShadow = 'none';
            }
            const listaClone = clonedDoc.getElementById('img_lista');
            if (listaClone) {
                if (listaClone.style.display === 'block') {
                    listaClone.style.width = '100%';
                    listaClone.style.boxSizing = 'border-box';
                } else {
                    listaClone.style.display = 'grid';
                    listaClone.style.gridTemplateColumns = '1fr 1fr';
                    listaClone.style.gap = '8px';
                }
            }
        }
    }).then(async canvas => {
        const dataURL = canvas.toDataURL('image/png');
        const base64  = dataURL.replace(/^data:image\/png;base64,/, '');

        try {
            const { clipboard, nativeImage } = require('electron');
            clipboard.writeImage(nativeImage.createFromDataURL(dataURL));
        } catch (e) { console.warn('Clipboard falhou:', e.message); }

        fecharModal('modalCompartilhar');

        try {
            const { ipcRenderer } = require('electron');
            const autenticado = await ipcRenderer.invoke('gdrive:status');
            if (autenticado) {
                mostrarToastDrive('⬆️ Salvando no Google Drive...');
                const resultado = await ipcRenderer.invoke('gdrive:upload', { base64, nomeArquivo });
                if (resultado && resultado.id) {
                    mostrarToastDrive('✅ Salvo no Google Drive!');
                } else {
                    mostrarToastDrive('⚠️ Falha ao salvar no Drive.');
                }
            } else {
                alert("✅ Imagem copiada! Cole no WhatsApp (Ctrl + V).");
            }
        } catch (errDrive) {
            alert("✅ Imagem copiada!\n\n⚠️ Não foi possível salvar no Drive: " + errDrive.message);
        }
    }).catch(err => { alert("Erro ao gerar imagem: " + err); });
}

function mostrarToastDrive(msg) {
    let toast = document.getElementById('toast_drive');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast_drive';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:#1f2937;color:#fff;font-size:13px;font-weight:700;padding:12px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.4s;font-family:sans-serif;max-width:320px;';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

// ==========================================
// MÓDULO DE FORMAÇÃO (ASPIRANTES) & MAPA INTERATIVO
// ==========================================

// O Currículo Oficial (A Árvore de Habilidades)
const trilhaCurriculo = [
    { 
        id: 1, titulo: 'O Chamado', subtitulo: 'O que é ser coroinha?', icone: 'fa-door-open',
        texto: `<p>Ser coroinha não é apenas vestir uma túnica bonita, é um <strong>chamado especial</strong> para servir ao próprio Cristo no altar.</p>
                <p>Nesta etapa, o aspirante deve compreender que a pontualidade, o silêncio e o respeito dentro da igreja são fundamentais. O altar é um lugar sagrado.</p>`,
        materiais: [
            { icone: 'fa-file-pdf', cor: 'text-red-500', titulo: 'Oração do Coroinha', link: '#' }
        ]
    },
    { 
        id: 2, titulo: 'O Templo', subtitulo: 'Presbitério e Altar', icone: 'fa-church',
        texto: `<p>A igreja é dividida em partes importantes que você precisa conhecer de olhos fechados:</p>
                <ul class="list-disc pl-5 space-y-1 mt-2">
                    <li><strong>A Nave:</strong> Onde os fiéis ficam sentados.</li>
                    <li><strong>O Presbitério:</strong> A área mais elevada onde fica o altar.</li>
                    <li><strong>A Credência:</strong> A mesinha lateral onde ficam os objetos da missa.</li>
                    <li><strong>A Sacristia:</strong> Onde nos preparamos e rezamos antes da missa.</li>
                </ul>`,
        materiais: []
    },
    { 
        id: 3, titulo: 'Postura', subtitulo: 'Genuflexão e Reverências', icone: 'fa-person-praying',
        texto: `<p>O corpo também reza! Aprender a se portar é essencial.</p>
                <p><strong>Genuflexão:</strong> Tocar o joelho direito no chão. Fazemos isso sempre que passamos em frente ao Sacrário (onde Jesus está guardado).</p>
                <p><strong>Reverência Profunda:</strong> Curvar o corpo para frente. Fazemos isso para o Altar (quando Jesus não está no Sacrário) e durante o Credo.</p>`,
        materiais: [
            { icone: 'fab fa-youtube', cor: 'text-red-600', titulo: 'Como fazer a genuflexão correta', link: '#' }
        ]
    },
    { 
        id: 4, titulo: 'Alfaias', subtitulo: 'Cálice, Galhetas, Sanguinho', icone: 'fa-wine-glass',
        texto: `<p>Você será responsável por manusear os objetos sagrados da missa. Decorar os nomes é o primeiro passo:</p>
                <p><strong>Galhetas:</strong> As jarrinhas com Água e Vinho.<br>
                <strong>Cálice:</strong> A taça onde o vinho vira Sangue.<br>
                <strong>Âmbula:</strong> A taça com tampa onde ficam as hóstias.<br>
                <strong>Sanguinho:</strong> O paninho comprido usado para limpar o cálice.</p>`,
        materiais: [
            { icone: 'fa-file-pdf', cor: 'text-blue-500', titulo: 'Dicionário Litúrgico com Fotos', link: '#' }
        ]
    },
    { 
        id: 5, titulo: 'A Missa', subtitulo: 'Ritos Iniciais à Comunhão', icone: 'fa-book-bible',
        texto: `<p>A Missa tem um roteiro exato, e o coroinha precisa saber o que acontece a seguir para não se perder.</p>
                <p>O foco aqui é aprender o momento de tocar a sineta (na consagração) e o momento do lavabo (levar a água e a toalha para o padre lavar as mãos).</p>`,
        materiais: []
    },
    { 
        id: 6, titulo: 'Turíbulo', subtitulo: 'Incenso, Fogo e Naveta', icone: 'fa-fire-burner',
        texto: `<p>A função mais avançada e cheia de fumaça! O Turiferário é quem manuseia o turíbulo, e o Naveteiro leva a naveta (o barquinho com o incenso).</p>
                <p>Nesta etapa, o foco é a segurança: como acender o carvão sem se queimar e como balançar o turíbulo no ritmo certo durante a procissão.</p>`,
        materiais: [
            { icone: 'fab fa-youtube', cor: 'text-red-600', titulo: 'Vídeo Prático: Manuseando o Turíbulo', link: '#' }
        ]
    },
    { 
        id: 7, titulo: 'Investidura', subtitulo: 'Pronto para o Serviço', icone: 'fa-hands-praying',
        texto: `<p>Parabéns! Você chegou ao final da sua preparação.</p>
                <p>A partir de agora, você entende o peso e a alegria de vestir a túnica. Repasse a liturgia, tire suas últimas dúvidas com seu Cerimoniário, e prepare-se para o dia da Festa de São Francisco!</p>`,
        materiais: []
    }
];

let aspiranteAbertoMapa = null;

function salvarAspirante() {
    const inputNome = document.getElementById('novo_aspirante_nome');
    const nome = inputNome.value.trim();
    if (!nome) return alert("Digite o nome do novato.");
    
    try {
        db.prepare(`INSERT INTO aspirantes (nome, progresso) VALUES (?, 0)`).run(nome);
        inputNome.value = '';
        listarAspirantes();
    } catch(err) { alert("Erro ao cadastrar aspirante: " + err.message); }
}

function listarAspirantes() {
    const tbody = document.getElementById('tabela_aspirantes');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const lista = db.prepare(`SELECT * FROM aspirantes ORDER BY nome ASC`).all();
    
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-gray-400 font-bold text-xs"><i class="fas fa-inbox text-2xl mb-2 block"></i>Nenhum aspirante em formação no momento.</td></tr>`;
        return;
    }

    lista.forEach(asp => {
        // O progresso no banco de dados agora indica em qual índice do mapa ele está
        const etapaAtual = asp.progresso; 
        const porcentagem = Math.round((etapaAtual / trilhaCurriculo.length) * 100);
        
        let corBarra = 'bg-gray-300';
        if (porcentagem > 0 && porcentagem < 50) corBarra = 'bg-amber-500';
        else if (porcentagem >= 50 && porcentagem < 100) corBarra = 'bg-blue-500';
        else if (porcentagem === 100) corBarra = 'bg-emerald-500';

        // Botão inteligente: Se já completou o mapa, o botão vira "Investidura"
        let btnAcaoPrincipal = '';
        if (porcentagem === 100) {
            btnAcaoPrincipal = `
                <button onclick="promoverAspirante(${asp.id}, '${asp.nome}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1.5 animate-pulse">
                    <i class="fas fa-medal"></i> Investidura
                </button>`;
        } else {
            btnAcaoPrincipal = `
                <button onclick="abrirMapaTrilha(${asp.id}, '${asp.nome}')" class="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1.5">
                    <i class="fas fa-map"></i> Ver Mapa
                </button>`;
        }

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="py-4 px-6 text-xs text-gray-400 font-bold">#${asp.id}</td>
                <td class="py-4 px-6 text-gray-800 font-black">${asp.nome}</td>
                <td class="py-4 px-6">
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] font-black w-8 text-right text-gray-500">${porcentagem}%</span>
                        <div class="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden border border-gray-300">
                            <div class="${corBarra} h-2.5 rounded-full transition-all duration-500" style="width: ${porcentagem}%"></div>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-6 text-center flex justify-center gap-2">
                    ${btnAcaoPrincipal}
                    <button onclick="deletarAspirante(${asp.id})" class="text-gray-300 hover:text-red-500 transition-colors px-2" title="Remover aspirante"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`;
    });
}

function abrirMapaTrilha(idAspirante, nomeAspirante) {
    aspiranteAbertoMapa = idAspirante;
    document.getElementById('mapa_nome_aspirante').innerText = nomeAspirante;
    document.getElementById('modalMapaTrilha').classList.remove('hidden');
    renderizarMapaInterativo();
}

function renderizarMapaInterativo() {
    const asp = db.prepare(`SELECT * FROM aspirantes WHERE id = ?`).get(aspiranteAbertoMapa);
    if (!asp) return;

    const etapaAtual = asp.progresso; 
    const container = document.getElementById('trilha_container_nos');
    container.innerHTML = '';

    trilhaCurriculo.forEach((modulo, index) => {
        const isConcluido = index < etapaAtual;
        const isAtivo = index === etapaAtual;
        const isBloqueado = index > etapaAtual;

        // Estilização condicional baseada no status do nó
        const bgCircle = isBloqueado ? 'bg-gray-700' : (isConcluido ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse');
        const iconColor = isBloqueado ? 'text-gray-500' : 'text-white';
        const borderClass = isAtivo ? 'border-4 border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.6)]' : (isConcluido ? 'border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-2 border-gray-600');
        const iconeFas = isBloqueado ? 'fa-lock' : modulo.icone;
        
        // A CORREÇÃO ESTÁ AQUI: Plugei a tomada com as crases (`) em volta do onclick!
        const acaoClick = (isAtivo || isConcluido) ? `onclick="abrirConteudoModulo(${index}, ${isAtivo})"` : '';
        
        // Deixei o cursor amigável para quem já concluiu e quer clicar para revisar a matéria
        const cursor = isAtivo ? 'cursor-pointer hover:scale-110' : (isConcluido ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50');

        // Nó (O círculo e os textos)
        const htmlNode = `
            <div class="flex flex-col items-center relative group flex-none" style="width: 130px;">
                <div ${acaoClick} title="${isAtivo ? 'Clique para aprender!' : (isConcluido ? 'Clique para revisar!' : '')}" class="w-20 h-20 rounded-full flex items-center justify-center ${bgCircle} ${borderClass} ${cursor} transition-all duration-300 z-10 relative">
                    <i class="fas ${iconeFas} text-2xl ${iconColor}"></i>
                    ${isConcluido ? `<div class="absolute -bottom-1 -right-1 bg-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg border-2 border-emerald-500"><i class="fas fa-check text-emerald-500 text-xs"></i></div>` : ''}
                </div>
                <div class="text-center mt-5">
                    <p class="text-[11px] font-black uppercase tracking-widest ${isConcluido ? 'text-emerald-400' : (isAtivo ? 'text-amber-400' : 'text-gray-500')}">${modulo.titulo}</p>
                    <p class="text-[9px] text-gray-400 mt-1.5 font-bold leading-tight h-8">${modulo.subtitulo}</p>
                </div>
            </div>`;

        // Linha conectora
        let htmlLine = '';
        if (index < trilhaCurriculo.length - 1) {
            const lineBg = isConcluido ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-700';
            htmlLine = `<div class="w-12 h-2 rounded-full ${lineBg} mx-1 -mt-12 z-0 relative transition-colors duration-500 flex-none"></div>`;
        }

        container.innerHTML += htmlNode + htmlLine;
    });
}

// ==========================================
// FUNÇÕES DA TRILHA DE FORMAÇÃO ATUALIZADAS
// ==========================================

function abrirConteudoModulo(indexCurriculo, isAtivo) {
    const modulo = trilhaCurriculo[indexCurriculo];
    
    // Preenche o cabeçalho
    document.getElementById('cont_titulo').innerText = modulo.titulo;
    document.getElementById('cont_subtitulo').innerText = modulo.subtitulo;
    document.getElementById('cont_icone').className = `fas ${modulo.icone} text-2xl text-white`;
    
    // Ajusta as cores do ícone baseado no status
    const bgIcone = document.getElementById('cont_icone_bg');
    bgIcone.className = `w-14 h-14 rounded-full flex items-center justify-center flex-none shadow-lg border-2 ${isAtivo ? 'bg-amber-500 border-amber-300' : 'bg-emerald-500 border-emerald-300'}`;
    
    // Injeta o texto HTML
    document.getElementById('cont_texto').innerHTML = modulo.texto;
    
    // Renderiza os botões de materiais
    const divMateriais = document.getElementById('cont_materiais');
    if (modulo.materiais && modulo.materiais.length > 0) {
        divMateriais.innerHTML = modulo.materiais.map(mat => `
            <a href="${mat.link}" target="_blank" class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group">
                <i class="${mat.icone} text-xl ${mat.cor} group-hover:scale-110 transition-transform"></i>
                <span class="text-sm font-bold text-gray-700">${mat.titulo}</span>
                <i class="fas fa-external-link-alt ml-auto text-gray-300 text-xs"></i>
            </a>
        `).join('');
    } else {
        divMateriais.innerHTML = `<p class="text-xs text-gray-400 italic px-2">Nenhum anexo para esta aula.</p>`;
    }

    // Gerencia o botão de "Concluir" vs "Aviso de Concluído"
    const btnConcluir = document.getElementById('btn_concluir_modulo');
    const msgConcluido = document.getElementById('msg_modulo_concluido');
    
    if (isAtivo) {
        btnConcluir.classList.remove('hidden');
        msgConcluido.classList.add('hidden');
        // Sobrescreve a ação do botão para este módulo específico
        btnConcluir.onclick = () => {
            fecharModal('modalConteudoModulo');
            executarAvancoTrilha(modulo.id); 
        };
    } else {
        // Se já foi concluído, mostra só a mensagem verde de revisão
        btnConcluir.classList.add('hidden');
        msgConcluido.classList.remove('hidden');
    }

    document.getElementById('modalConteudoModulo').classList.remove('hidden');
}

// --- ESSA FUNÇÃO SUBSTITUI A ANTIGA aprenderModulo() ---
function executarAvancoTrilha(idModulo) {
    const asp = db.prepare(`SELECT * FROM aspirantes WHERE id = ?`).get(aspiranteAbertoMapa);
    const novoProgresso = asp.progresso + 1;

    try {
        db.prepare(`UPDATE aspirantes SET progresso = ? WHERE id = ?`).run(novoProgresso, aspiranteAbertoMapa);
        
        if (novoProgresso === trilhaCurriculo.length) {
            renderizarMapaInterativo(); 
            listarAspirantes(); 
            
            setTimeout(() => {
                fecharModal('modalMapaTrilha');
                abrirCelebracao(
                    "Trilha Concluída!", 
                    `Espetacular! ${asp.nome} completou todos os passos da formação. O mapa está dominado e ele(a) já está pronto(a) para a tão aguardada Investidura.`,
                    "fa-map-marked-alt"
                );
            }, 600);
        } else {
            renderizarMapaInterativo();
            listarAspirantes(); 
        }
    } catch (e) {
        alert("Erro ao avançar na trilha: " + e.message);
    }
}

function promoverAspirante(id, nome) {
    // 1. Em vez do 'confirm()', configuramos e abrimos o nosso modal bonitão
    document.getElementById('conf_nome_investidura').innerText = nome;
    
    const btnConfirmar = document.getElementById('btn_confirmar_investidura_final');
    btnConfirmar.onclick = () => executarPromocao(id, nome); // Liga o botão à ação
    
    document.getElementById('modalConfirmarInvestidura').classList.remove('hidden');
}

function executarPromocao(id, nome) {
    fecharModal('modalConfirmarInvestidura'); // Esconde a pergunta

    try {
        // Transfere de Aspirante para Coroinha
        db.prepare(`INSERT INTO coroinhas (nome, ${colunaTipo}) VALUES (?, ?)`).run(nome, 'Coroinha');
        db.prepare(`DELETE FROM aspirantes WHERE id = ?`).run(id);
        
        listarAspirantes();
        listarCoroinhas(); // Atualiza a tabela mestra em background
        
        // 2. Chama a grande festa na tela em vez do 'alert()'
        setTimeout(() => {
            abrirCelebracao(
                "Habemus Coroinha!", 
                `A túnica está oficialmente entregue! ${nome} acaba de entrar para a equipe principal da Paróquia de Santo Antônio de Pádua.`,
                "fa-medal"
            );
        }, 300);

    } catch(err) { alert("Erro ao promover: " + err.message); }
}

// O Maestro das Festas (Controla o Modal de Celebração)
function abrirCelebracao(titulo, mensagem, iconeFa) {
    document.getElementById('cel_titulo').innerText = titulo;
    document.getElementById('cel_mensagem').innerText = mensagem;
    
    const iconeEl = document.getElementById('cel_icone');
    // Reseta o ícone para usar o que a gente mandou (medalha ou mapa)
    iconeEl.className = `fas ${iconeFa} text-7xl text-amber-400 drop-shadow-lg animate-bounce`;
    
    document.getElementById('modalCelebracao').classList.remove('hidden');
}

function deletarAspirante(id) {
    if (!confirm("Excluir este aspirante do sistema?")) return;
    try {
        db.prepare(`DELETE FROM aspirantes WHERE id = ?`).run(id);
        listarAspirantes();
    } catch(err) { alert("Erro: " + err.message); }
}

async function conectarGoogleDrive() {
    try {
        const { ipcRenderer } = require('electron');
        const btn = document.getElementById('btn_conectar_drive');
        btn.disabled = true;
        btn.innerText = 'Aguardando autorização...';
        await ipcRenderer.invoke('gdrive:conectar');
        atualizarStatusDrive();
    } catch (e) {
        alert('Erro ao conectar: ' + e.message);
        atualizarStatusDrive();
    }
}

async function desconectarGoogleDrive() {
    if (!confirm('Desconectar do Google Drive?\nAs escalas não serão mais salvas automaticamente.')) return;
    const { ipcRenderer } = require('electron');
    await ipcRenderer.invoke('gdrive:desconectar');
    atualizarStatusDrive();
}

async function atualizarStatusDrive() {
    try {
        const { ipcRenderer } = require('electron');
        const autenticado = await ipcRenderer.invoke('gdrive:status');
        const statusEl  = document.getElementById('drive_status_texto');
        const btnConect = document.getElementById('btn_conectar_drive');
        const btnDescon = document.getElementById('btn_desconectar_drive');
        if (!statusEl) return;
        if (autenticado) {
            statusEl.innerHTML = '<span style="color:#16a34a;font-weight:900;">● Conectado</span> — imagens salvas automaticamente na pasta <em>Escalas Litúrgicas - Cariré</em>';
            btnConect.classList.add('hidden');
            btnDescon.classList.remove('hidden');
        } else {
            statusEl.innerHTML = '<span style="color:#9ca3af;font-weight:900;">● Desconectado</span> — clique em Conectar para ativar';
            btnConect.classList.remove('hidden');
            btnConect.disabled = false;
            btnConect.innerText = 'Conectar com Google Drive';
            btnDescon.classList.add('hidden');
        }
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('txt_data_atual').innerText = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    aplicarTemaLiturgico();
    popularFiltroMeses();
    mudarAba('calendario'); 
    atualizarStatusDrive(); 

    let nivelZoom = 1.4;
    const ZOOM_PASSO = 0.1;
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 2.0;
    const ZOOM_PADRAO = 1.4;

    function aplicarZoom() {
        document.body.style.zoom = nivelZoom;
    }

    aplicarZoom();

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
            e.preventDefault();
            nivelZoom = Math.min(ZOOM_MAX, parseFloat((nivelZoom + ZOOM_PASSO).toFixed(1)));
            aplicarZoom();
        }
        if (e.ctrlKey && (e.key === '-' || e.code === 'NumpadSubtract')) {
            e.preventDefault();
            nivelZoom = Math.max(ZOOM_MIN, parseFloat((nivelZoom - ZOOM_PASSO).toFixed(1)));
            aplicarZoom();
        }
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            nivelZoom = ZOOM_PADRAO;
            aplicarZoom();
        }
    });

    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                nivelZoom = Math.min(ZOOM_MAX, parseFloat((nivelZoom + ZOOM_PASSO).toFixed(1)));
            } else {
                nivelZoom = Math.max(ZOOM_MIN, parseFloat((nivelZoom - ZOOM_PASSO).toFixed(1)));
            }
            aplicarZoom();
        }
    }, { passive: false });
});