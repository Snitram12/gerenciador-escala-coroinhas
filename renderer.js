const db = require('./database');
const XLSX = require('xlsx');

// ==========================================
// TEMA LITÚRGICO (CORES)
// ==========================================
function aplicarTemaLiturgico() {
    const data = new Date();
    const mes = data.getMonth() + 1;
    const dia = data.getDate();
    let cor = 'bg-emerald-600'; // Verde (Comum)
    
    // Simplificação do cálculo: Roxo (Quaresma/Advento), Branco/Dourado (Natal/Páscoa)
    if ((mes === 3) || (mes === 12 && dia < 25)) cor = 'bg-indigo-800'; 
    else if ((mes === 12 && dia >= 25) || (mes === 1) || (mes === 4)) cor = 'bg-amber-600';

    // Aplica a cor na Navbar do sistema e na borda do Card do WhatsApp
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

// ==========================================
// NAVEGAÇÃO DE ABAS
// ==========================================
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    
    if(tabId === 'config') carregarFuncoes();
    if(tabId === 'escala') {
        carregarCheckboxesFuncoes();
        renderizarCalendario(); 
    }
}

// ==========================================
// CADASTRO DE COROINHAS
// ==========================================
function importarPlanilha(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Converte a planilha em uma lista de objetos
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        // Mágica para ler independente se a coluna está em MAIÚSCULO, minúsculo ou com acento!
        dadosTemporariosImportacao = rawData.map(item => {
            const nomeCoroinha = item.NOME || item.Nome || item.nome || item['NOME COMPLETO'] || '';
            const nivelBruto = String(item.NÍVEL || item.NIVEL || item.Nivel || item.nivel || 'coroinha');
            const telefoneCoroinha = item.TELEFONE || item.Telefone || item.telefone || '';

            return {
                nome: nomeCoroinha,
                nivel: nivelBruto.toLowerCase().includes('mestre') ? 'mestre de cerimonia' : 'coroinha',
                telefone: telefoneCoroinha
            };
        }).filter(c => c.nome !== ""); // Remove linhas que não tenham o nome

        // Verificação extra para avisar se deu algo errado
        if (dadosTemporariosImportacao.length === 0) {
            alert("Ops! O sistema leu a planilha, mas não encontrou os nomes. Verifique se a coluna na primeira linha da planilha se chama 'NOME'.");
            fecharModalPreview();
        } else {
            renderizarPreviewImportacao();
            document.getElementById('modal_preview_importacao').classList.remove('hidden');
        }
        
        event.target.value = ''; // Reseta o campo de arquivo para você poder tentar de novo se precisar
    };
    reader.readAsArrayBuffer(file);
}

function renderizarPreviewImportacao() {
    const tbody = document.getElementById('corpo_preview_importacao');
    tbody.innerHTML = dadosTemporariosImportacao.map((c, index) => `
        <tr class="hover:bg-emerald-50/30 transition">
            <td class="p-2"><input type="text" value="${c.nome}" onchange="atualizarItemTemporario(${index}, 'nome', this.value)" class="w-full border-none focus:ring-1 focus:ring-emerald-400 rounded p-1 text-sm text-gray-700"></td>
            <td class="p-2">
                <select onchange="atualizarItemTemporario(${index}, 'nivel', this.value)" class="w-full border-none focus:ring-1 focus:ring-emerald-400 rounded p-1 text-sm text-gray-600 bg-transparent">
                    <option value="coroinha" ${c.nivel === 'coroinha' ? 'selected' : ''}>Coroinha</option>
                    <option value="mestre de cerimonia" ${c.nivel === 'mestre de cerimonia' ? 'selected' : ''}>Mestre de Cerimônia</option>
                </select>
            </td>
            <td class="p-2"><input type="text" value="${c.telefone}" onchange="atualizarItemTemporario(${index}, 'telefone', this.value)" class="w-full border-none focus:ring-1 focus:ring-emerald-400 rounded p-1 text-sm text-gray-500"></td>
            <td class="p-2 text-center">
                <button onclick="removerItemTemporario(${index})" class="text-red-400 hover:text-red-600 transition"><i class="fas fa-times-circle"></i></button>
            </td>
        </tr>
    `).join('');
}

function atualizarItemTemporario(index, campo, valor) {
    dadosTemporariosImportacao[index][campo] = valor;
}

function removerItemTemporario(index) {
    dadosTemporariosImportacao.splice(index, 1);
    renderizarPreviewImportacao();
}

function fecharModalPreview() {
    document.getElementById('modal_preview_importacao').classList.add('hidden');
    dadosTemporariosImportacao = [];
}

function finalizarImportacao() {
    if (dadosTemporariosImportacao.length === 0) return alert("Não há dados para importar.");

    const stmt = db.prepare('INSERT INTO coroinhas (nome, nivel, telefone) VALUES (?, ?, ?)');
    
    // Inicia uma transação para ser mais rápido
    const transacao = db.transaction((dados) => {
        for (const c of dados) stmt.run(c.nome, c.nivel, c.telefone);
    });

    try {
        transacao(dadosTemporariosImportacao);
        alert(`Sucesso! ${dadosTemporariosImportacao.length} coroinhas foram adicionados à comunidade.`);
        fecharModalPreview();
        carregarListaCoroinhas(); // Atualiza a tabela principal
    } catch (err) {
        alert("Erro ao salvar no banco de dados. Verifique se há nomes duplicados.");
    }
}

function calcularIdade(dataNascimento) {
    if (!dataNascimento) return;
    const hoje = new Date(); 
    const nasc = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const mes = hoje.getMonth() - nasc.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;

    document.getElementById('c_idade').value = idade + " anos";
    const inputResp = document.getElementById('c_resp');
    
    if (idade < 18) {
        inputResp.disabled = false;
        inputResp.classList.remove('bg-gray-100', 'cursor-not-allowed');
    } else {
        inputResp.disabled = true;
        inputResp.value = ''; 
        inputResp.classList.add('bg-gray-100', 'cursor-not-allowed');
    }
}

function salvarCoroinha() {
    const id = document.getElementById('c_id').value;
    const nome = document.getElementById('c_nome').value;
    const nasc = document.getElementById('c_nasc').value;
    const resp = document.getElementById('c_resp').value;
    const tel = document.getElementById('c_tel').value;
    const end = document.getElementById('c_end').value;
    const nivel = document.getElementById('c_nivel').value;

    if (!nome) return alert("O nome é obrigatório!");

    if (id) {
        db.prepare('UPDATE coroinhas SET nome=?, data_nascimento=?, responsavel=?, telefone=?, endereco=?, nivel=? WHERE id=?').run(nome, nasc, resp, tel, end, nivel, id);
    } else {
        db.prepare('INSERT INTO coroinhas (nome, data_nascimento, responsavel, telefone, endereco, nivel) VALUES (?,?,?,?,?,?)').run(nome, nasc, resp, tel, end, nivel);
    }
    limparFormulario();
    carregarListaCoroinhas(); 
}

function carregarListaCoroinhas() {
    const coroinhas = db.prepare('SELECT * FROM coroinhas ORDER BY nome ASC').all();
    const tbody = document.getElementById('lista_cadastrados');
    tbody.innerHTML = '';
    
    // Atualiza o pequeno contador no topo da tabela
    const contador = document.getElementById('contador_coroinhas');
    if (contador) contador.innerText = `${coroinhas.length} cadastrados`;

    coroinhas.forEach(c => {
        // Lógica visual para a etiqueta de Nível
        let badgeNivel = `<span class="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Coroinha</span>`;
        if (c.nivel === 'mestre de cerimonia') {
            badgeNivel = `<span class="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Mestre</span>`;
        }

        tbody.innerHTML += `
            <tr class="hover:bg-emerald-50/30 transition group">
                <td class="p-4 border-b">
                    <p class="font-bold text-gray-700 text-sm truncate max-w-[180px]" title="${c.nome}">${c.nome}</p>
                    <p class="text-xs text-gray-400 font-semibold mt-0.5"><i class="fas fa-phone-alt text-[10px] mr-1"></i>${c.telefone || 'Sem contato'}</p>
                </td>
                <td class="p-4 border-b text-center align-middle">${badgeNivel}</td>
                <td class="p-4 border-b text-center align-middle">
                    <div class="flex justify-center gap-3 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button onclick="editarCoroinha(${c.id})" class="text-blue-500 hover:text-blue-700 transform hover:scale-110 transition" title="Editar Cadastro"><i class="fas fa-edit"></i></button>
                        <button onclick="excluirCoroinha(${c.id})" class="text-red-400 hover:text-red-600 transform hover:scale-110 transition" title="Excluir Coroinha"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>`;
    });
}

// ==========================================
// FILTRO DE PESQUISA NA TABELA DE CADASTRO
// ==========================================
function filtrarTabelaCoroinhas() {
    // Pega o que você digitou e transforma tudo em minúsculo para facilitar a busca
    const termo = document.getElementById('busca_coroinha').value.toLowerCase();
    
    // Pega todas as linhas da tabela de coroinhas
    const linhas = document.querySelectorAll('#lista_cadastrados tr');
    
    // Passa por cada linha olhando se o nome ou nível batem com a pesquisa
    linhas.forEach(linha => {
        // Pega todo o texto escrito dentro daquela linha (nome, telefone, nivel)
        const textoDaLinha = linha.innerText.toLowerCase();
        
        if (textoDaLinha.includes(termo)) {
            linha.style.display = ''; // Se achar, mostra a linha
        } else {
            linha.style.display = 'none'; // Se não achar, esconde a linha
        }
    });
}

function editarCoroinha(id) {
    const coroinha = db.prepare('SELECT * FROM coroinhas WHERE id = ?').get(id);
    document.getElementById('c_id').value = coroinha.id;
    document.getElementById('c_nome').value = coroinha.nome;
    document.getElementById('c_nasc').value = coroinha.data_nascimento;
    document.getElementById('c_tel').value = coroinha.telefone;
    document.getElementById('c_end').value = coroinha.endereco;
    document.getElementById('c_nivel').value = coroinha.nivel;
    calcularIdade(coroinha.data_nascimento);
    document.getElementById('c_resp').value = coroinha.responsavel || '';
    document.getElementById('btn_salvar').innerText = "Atualizar Coroinha";
    document.getElementById('btn_salvar').classList.replace('bg-emerald-600', 'bg-yellow-600');
    document.getElementById('btn_salvar').classList.replace('hover:bg-emerald-700', 'hover:bg-yellow-700');
    window.scrollTo(0, 0);
}

function excluirCoroinha(id) {
    if (confirm('Tem certeza? Isso apagará o histórico dele nas escalas.')) {
        db.prepare('DELETE FROM coroinhas WHERE id = ?').run(id);
        carregarListaCoroinhas(); 
    }
}

function limparFormulario() {
    ['c_id','c_nome','c_nasc','c_idade','c_tel','c_end'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('c_resp').value = '';
    document.getElementById('c_resp').disabled = true; 
    document.getElementById('c_resp').classList.add('bg-gray-100', 'cursor-not-allowed');
    document.getElementById('c_nivel').value = 'coroinha';
    document.getElementById('btn_salvar').innerText = "Salvar Cadastro";
    document.getElementById('btn_salvar').classList.replace('bg-yellow-600', 'bg-emerald-600');
    document.getElementById('btn_salvar').classList.replace('hover:bg-yellow-700', 'hover:bg-emerald-700');
}

// ==========================================
// CONFIGURAÇÕES (FUNÇÕES)
// ==========================================
try { db.prepare('ALTER TABLE funcoes ADD COLUMN descricao TEXT').run(); } catch (e) { }
try { db.prepare('ALTER TABLE escalas ADD COLUMN funcao_temp TEXT').run(); } catch (e) { }
try { db.prepare('ALTER TABLE eventos ADD COLUMN titulo TEXT').run(); } catch (e) { }

function carregarFuncoes() {
    const funcoes = db.prepare('SELECT * FROM funcoes ORDER BY nome ASC').all();
    document.getElementById('lista_funcoes').innerHTML = funcoes.map(f => `
        <div class="bg-white border-l-4 border-emerald-500 rounded-lg shadow-sm p-5 hover:shadow-md transition">
            <h4 class="font-bold text-gray-800 mb-1">${f.nome}</h4>
            <p class="text-sm text-gray-500 italic">"${f.descricao || 'Sem descrição.'}"</p>
            <div class="flex justify-end gap-3 mt-4">
                <button onclick="editarFuncaoOficial(${f.id})" class="text-xs font-bold text-blue-500 hover:text-blue-700 uppercase">Editar</button>
                <button onclick="excluirFuncaoOficial(${f.id}, '${f.nome}')" class="text-xs font-bold text-red-400 hover:text-red-600 uppercase">Excluir</button>
            </div>
        </div>
    `).join('');
}

function addFuncao() {
    const id = document.getElementById('f_id').value;
    const nome = document.getElementById('nova_funcao').value.trim();
    const desc = document.getElementById('nova_descricao').value.trim();
    if(!nome) return alert("O nome da função é obrigatório!");
    
    try {
        if (id) db.prepare('UPDATE funcoes SET nome = ?, descricao = ? WHERE id = ?').run(nome, desc, id);
        else db.prepare('INSERT INTO funcoes (nome, descricao) VALUES (?, ?)').run(nome, desc);
        cancelarEdicaoFuncao(); 
        carregarFuncoes();
        carregarCheckboxesFuncoes(); 
    } catch (error) { alert("Erro ao salvar."); }
}

function editarFuncaoOficial(id) {
    const f = db.prepare('SELECT * FROM funcoes WHERE id = ?').get(id);
    document.getElementById('f_id').value = f.id;
    document.getElementById('nova_funcao').value = f.nome;
    document.getElementById('nova_descricao').value = f.descricao || '';
    document.getElementById('titulo_form_funcao').innerText = "Editando: " + f.nome;
    document.getElementById('btn_salvar_funcao').innerText = "Atualizar";
    document.getElementById('btn_cancelar_funcao').classList.remove('hidden');
}

function cancelarEdicaoFuncao() {
    document.getElementById('f_id').value = '';
    document.getElementById('nova_funcao').value = '';
    document.getElementById('nova_descricao').value = '';
    document.getElementById('titulo_form_funcao').innerText = "Nova Função";
    document.getElementById('btn_salvar_funcao').innerText = "Salvar";
    document.getElementById('btn_cancelar_funcao').classList.add('hidden');
}

function excluirFuncaoOficial(id, nome) {
    if(confirm(`Deseja apagar a função "${nome}"?`)) {
        db.prepare('DELETE FROM funcoes WHERE id = ?').run(id);
        carregarFuncoes();
        carregarCheckboxesFuncoes();
    }
}

// ==========================================
// CELEBRAÇÕES E CALENDÁRIO
// ==========================================
let dataAtualCalendario = new Date(); 

function mudarMes(direcao) {
    dataAtualCalendario.setMonth(dataAtualCalendario.getMonth() + direcao);
    renderizarCalendario();
}

function carregarCheckboxesFuncoes() {
    const funcoes = db.prepare('SELECT * FROM funcoes').all();
    document.getElementById('lista_checkbox_funcoes').innerHTML = funcoes.map(f => `
        <label class="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-100 rounded">
            <input type="checkbox" value="${f.id}" class="funcao-checkbox rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4">
            <span class="text-gray-700 font-medium">${f.nome}</span>
        </label>
    `).join('');
}

function salvarEvento() {
    const titulo = document.getElementById('ev_titulo').value.trim(); // Pega o título novo
    const data = document.getElementById('ev_data').value;
    const horario = document.getElementById('ev_horario').value;
    let igreja = document.getElementById('ev_igreja').value;
    const qtd = document.getElementById('ev_qtd').value;
    
    const localTemp = document.getElementById('ev_local_temp').value.trim();
    const funcaoTemp = document.getElementById('ev_funcao_temp').value.trim();

    if(!data || !horario || !qtd) return alert("Preencha data, horário e quantidade base!");

    if (localTemp !== "") igreja = localTemp;

    const checkboxes = document.querySelectorAll('.funcao-checkbox:checked');
    let idsFuncoes = Array.from(checkboxes).map(cb => cb.value);

    if (funcaoTemp !== "") {
        const info = db.prepare("INSERT INTO funcoes (nome, descricao) VALUES (?, ?)").run(funcaoTemp, 'Temporária');
        idsFuncoes.push(info.lastInsertRowid);
    }

    // Agora o INSERT inclui a coluna 'titulo'
    db.prepare('INSERT INTO eventos (data, horario, igreja, qtd_coroinhas, funcoes_necessarias, titulo) VALUES (?,?,?,?,?,?)')
      .run(data, horario, igreja, qtd, idsFuncoes.join(','), titulo);
    
    renderizarCalendario();
    
    document.getElementById('ev_titulo').value = '';
    document.getElementById('ev_data').value = '';
    document.getElementById('ev_horario').value = '';
    document.getElementById('ev_local_temp').value = '';
    document.getElementById('ev_funcao_temp').value = '';
    document.getElementById('ev_qtd').value = '';
    checkboxes.forEach(cb => cb.checked = false);
    
    alert("Celebração agendada com sucesso!");
}

function renderizarCalendario() {
    const grade = document.getElementById('grade_calendario');
    grade.innerHTML = '';
    const ano = dataAtualCalendario.getFullYear();
    const mes = dataAtualCalendario.getMonth();
    const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById('mes_ano_display').innerText = `${nomesMeses[mes]} ${ano}`;

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
    const mesFormatado = (mes + 1).toString().padStart(2, '0');
    const prefixoData = `${ano}-${mesFormatado}`;
    
    const eventosDoMes = db.prepare(`SELECT * FROM eventos WHERE data LIKE '${prefixoData}-%' ORDER BY data ASC, horario ASC`).all();

    for (let i = 0; i < primeiroDiaSemana; i++) grade.innerHTML += `<div class="p-2 bg-gray-50 border border-gray-100 rounded-lg text-transparent">0</div>`;

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const diaFormatado = dia.toString().padStart(2, '0');
        const dataCompleta = `${prefixoData}-${diaFormatado}`;
        const eventosNoDia = eventosDoMes.filter(ev => ev.data === dataCompleta);

        let htmlDia = `<div class="p-2 border rounded-lg min-h-[100px] flex flex-col items-start transition-all ${eventosNoDia.length > 0 ? 'bg-emerald-50/30 border-emerald-200' : 'bg-white hover:bg-gray-50'}">`;
        htmlDia += `<span class="font-bold self-center mb-1 ${eventosNoDia.length > 0 ? 'text-emerald-700' : 'text-gray-500'}">${dia}</span>`;

        eventosNoDia.forEach(ev => {
            // Se tiver título, mostra ele. Se não, mostra a Igreja.
            let nomeBotao = ev.titulo ? `${ev.titulo} (${ev.horario})` : `${ev.horario} • ${ev.igreja}`;
            
            htmlDia += `
                <button onclick="abrirModalEscala(${ev.id})" class="w-full text-left bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 px-2 rounded mb-1 truncate shadow-sm transition-colors" title="${nomeBotao}">
                    ${nomeBotao}
                </button>
            `;
        });
        htmlDia += `</div>`;
        grade.innerHTML += htmlDia;
    }
}

// ==========================================
// MODAL DE ESCALA E EXPORTAÇÃO
// ==========================================
function abrirModalEscala(idEvento) {
    const evento = db.prepare('SELECT * FROM eventos WHERE id = ?').get(idEvento);
    document.getElementById('modal_id_evento').value = evento.id;
    
    // Preenche os campos de edição do Evento
    document.getElementById('modal_edit_titulo').value = evento.titulo || '';
    document.getElementById('modal_edit_data').value = evento.data;
    document.getElementById('modal_edit_horario').value = evento.horario;
    document.getElementById('modal_edit_local').value = evento.igreja;

    const todosCoroinhas = db.prepare('SELECT * FROM coroinhas ORDER BY nome ASC').all();
    const todasFuncoes = db.prepare('SELECT * FROM funcoes ORDER BY nome ASC').all();
    
    const idsFuncoes = evento.funcoes_necessarias ? evento.funcoes_necessarias.split(',') : [];
    const funcoesDoEvento = idsFuncoes.map(idFunc => db.prepare('SELECT * FROM funcoes WHERE id = ?').get(idFunc)).filter(f => f);
    const escalaSalva = db.prepare('SELECT * FROM escalas WHERE id_evento = ?').all(idEvento);

    let htmlConteudo = '';
    const iteracoes = Math.max(evento.qtd_coroinhas, funcoesDoEvento.length);

    for (let i = 0; i < iteracoes; i++) {
        const funcaoAtual = funcoesDoEvento[i] || { id: '', nome: 'Apoio/Geral' };
        let coroinhaSalvoId = escalaSalva[i] ? escalaSalva[i].id_coroinha : '';
        let funcaoSalvaId = escalaSalva[i] ? escalaSalva[i].id_funcao : funcaoAtual.id;
        let funcaoTempSalva = escalaSalva[i] ? escalaSalva[i].funcao_temp : null;

        if (funcaoTempSalva) funcaoSalvaId = 'outra';

        let optionsFuncoes = todasFuncoes.map(f => `<option value="${f.id}" ${f.id == funcaoSalvaId ? 'selected' : ''}>${f.nome}</option>`).join('');
        optionsFuncoes = `<option value="" ${!funcaoSalvaId && !funcaoTempSalva ? 'selected' : ''}>-- Escolha a Função --</option>` + optionsFuncoes;
        optionsFuncoes += `<option value="outra" class="font-bold text-indigo-600" ${funcaoSalvaId === 'outra' ? 'selected' : ''}>+ Função Avulsa...</option>`;

        htmlConteudo += `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 vaga-row mb-3 shadow-sm" data-index="${i}">
                <div class="flex gap-2 mb-2">
                    <select class="select-funcao-vaga flex-1 border border-gray-300 p-2 rounded outline-none focus:border-emerald-500 text-sm font-bold text-gray-700 bg-white" onchange="verificarOutraFuncao(this)">
                        ${optionsFuncoes}
                    </select>
                    <input type="text" class="input-nova-funcao ${funcaoTempSalva ? '' : 'hidden'} flex-1 border p-2 rounded text-sm border-indigo-400 bg-indigo-50 outline-none" placeholder="Qual a função?" value="${funcaoTempSalva || ''}">
                </div>
                <select class="select-coroinha-vaga w-full border border-gray-300 p-2 rounded outline-none focus:border-emerald-500 text-sm bg-white">
                    <option value="">-- Escalar Coroinha --</option>
                    ${todosCoroinhas.map(c => `<option value="${c.id}" ${c.id == coroinhaSalvoId ? 'selected' : ''}>${c.nome} (${c.nivel})</option>`).join('')}
                </select>
            </div>
        `;
    }

    document.getElementById('modal_conteudo').innerHTML = htmlConteudo;
    document.getElementById('modal_escala').classList.remove('hidden');
}

function copiarEscalaQualquerDia() {
    const idEventoAtual = document.getElementById('modal_id_evento').value;
    const eventoAtual = db.prepare("SELECT * FROM eventos WHERE id = ?").get(idEventoAtual);
    if (!eventoAtual) return;

    const dataEscolhida = document.getElementById('data_copia').value;
    if (!dataEscolhida) return alert("Selecione uma data no calendário acima para puxar os nomes!");

    const eventoAntigo = db.prepare("SELECT id FROM eventos WHERE data = ? AND horario = ? AND igreja = ?").get(dataEscolhida, eventoAtual.horario, eventoAtual.igreja);

    if (!eventoAntigo) return alert(`Nenhuma celebração encontrada no dia ${dataEscolhida.split('-').reverse().join('/')} neste mesmo horário e local.`);

    const equipeAntiga = db.prepare("SELECT id_funcao, funcao_temp, id_coroinha FROM escalas WHERE id_evento = ?").all(eventoAntigo.id);
    if (equipeAntiga.length === 0) return alert("A celebração foi encontrada, mas a escala daquele dia estava vazia.");

    const rows = document.querySelectorAll('.vaga-row');
    let preenchidos = 0;

    // Preenche as caixinhas na ordem em que aparecem
    equipeAntiga.forEach((membro, index) => {
        if(rows[index]) {
            const selFuncao = rows[index].querySelector('.select-funcao-vaga');
            const selCoroinha = rows[index].querySelector('.select-coroinha-vaga');
            const inputTemp = rows[index].querySelector('.input-nova-funcao');

            if(membro.funcao_temp) {
                selFuncao.value = 'outra';
                inputTemp.value = membro.funcao_temp;
                inputTemp.classList.remove('hidden');
            } else {
                selFuncao.value = membro.id_funcao;
                inputTemp.classList.add('hidden');
            }
            
            selCoroinha.value = membro.id_coroinha;
            preenchidos++;
        }
    });

    alert(`Sucesso! ${preenchidos} servos foram importados do dia escolhido. Verifique os nomes e clique em Salvar.`);
}

function verificarOutraFuncao(selectElement) {
    const inputElement = selectElement.nextElementSibling;
    if (selectElement.value === 'outra') {
        inputElement.classList.remove('hidden');
        inputElement.focus();
    } else {
        inputElement.classList.add('hidden');
        inputElement.value = '';
    }
}

function fecharModal() { document.getElementById('modal_escala').classList.add('hidden'); }

function salvarEscalaManual() {
    const idEvento = document.getElementById('modal_id_evento').value;
    
    // 1. CAPTURAR OS DADOS DO EVENTO (Edição completa)
    const novoTitulo = document.getElementById('modal_edit_titulo').value.trim();
    const novaData = document.getElementById('modal_edit_data').value;
    const novoHorario = document.getElementById('modal_edit_horario').value;
    const novoLocal = document.getElementById('modal_edit_local').value.trim();

    if (!novaData || !novoHorario || !novoLocal) {
        alert("Erro: Data, Horário e Local são obrigatórios!");
        return;
    }

    // 2. ATUALIZAR A TABELA DE EVENTOS
    db.prepare('UPDATE eventos SET titulo = ?, data = ?, horario = ?, igreja = ? WHERE id = ?')
      .run(novoTitulo, novaData, novoHorario, novoLocal, idEvento);

    // 3. ATUALIZAR OS ESCALADOS (Lógica que você já tinha)
    const rows = document.querySelectorAll('.vaga-row');
    db.prepare('DELETE FROM escalas WHERE id_evento = ?').run(idEvento);
    const insertStmt = db.prepare('INSERT INTO escalas (id_evento, id_funcao, id_coroinha, funcao_temp) VALUES (?, ?, ?, ?)');
    
    rows.forEach(row => {
        const idCoroinha = row.querySelector('.select-coroinha-vaga').value;
        let idFuncao = row.querySelector('.select-funcao-vaga').value;
        const inputNovaFuncao = row.querySelector('.input-nova-funcao').value.trim();
        let funcaoTemp = null;

        if (idCoroinha) {
            if (idFuncao === 'outra' && inputNovaFuncao !== '') {
                idFuncao = null; funcaoTemp = inputNovaFuncao; 
            } else if (idFuncao === 'outra' || idFuncao === '') {
                idFuncao = null; 
            }
            insertStmt.run(idEvento, idFuncao, idCoroinha, funcaoTemp);
        }
    });

    alert('Show! A missa e a escala foram atualizadas com sucesso!');
    renderizarCalendario(); // Para o calendário mostrar a nova data/título se você mudou
}

async function copiarZapModal() {
    const idEvento = document.getElementById('modal_id_evento').value;
    const evento = db.prepare('SELECT * FROM eventos WHERE id = ?').get(idEvento);
    const dataBr = evento.data.split('-').reverse().join('/');
    
    document.getElementById('img_igreja').innerText = evento.igreja;
    document.getElementById('img_data').innerText = `${dataBr} às ${evento.horario}`;
    
    const elTitulo = document.getElementById('img_titulo');
    if (evento.titulo) {
        elTitulo.innerText = evento.titulo;
        elTitulo.classList.remove('hidden');
    } else {
        elTitulo.classList.add('hidden');
    }

    const rows = document.querySelectorAll('.vaga-row');
    const servosEscalados = [];

    rows.forEach(row => {
        const selectCoroinha = row.querySelector('.select-coroinha-vaga');
        const idCoroinha = selectCoroinha.value;
        if (!idCoroinha) return;

        const selectFuncao = row.querySelector('.select-funcao-vaga');
        const inputNova = row.querySelector('.input-nova-funcao');
        
        const nomeCoroinha = selectCoroinha.options[selectCoroinha.selectedIndex].text.replace(/\(.*\)/, '').trim();
        let nomeFuncao = selectFuncao.options[selectFuncao.selectedIndex].text;
        
        // MÁGICA AQUI: Define como nulo se não houver função escolhida
        let funcaoFinal = null;
        if (selectFuncao.value === 'outra') {
            if (inputNova.value.trim() !== '') funcaoFinal = inputNova.value.trim();
        } else if (selectFuncao.value !== '' && !nomeFuncao.startsWith('--')) {
            funcaoFinal = nomeFuncao;
        }

        servosEscalados.push({ nome: nomeCoroinha, funcao: funcaoFinal });
    });

    const listaContainer = document.getElementById('img_lista');
    let htmlLista = '';

    if (servosEscalados.length === 0) {
        htmlLista = `<div class="text-center text-red-500 font-bold p-4">Nenhum coroinha foi escalado.</div>`;
    } else if (servosEscalados.length > 6) {
        // MODO GRADE COMPACTA
        listaContainer.className = "grid grid-cols-2 gap-3 w-full"; 
        
        servosEscalados.forEach(s => {
            if (s.funcao) {
                // Com Função
                htmlLista += `
                    <div class="flex flex-col items-center justify-center bg-gray-50 p-2 rounded border-l-4 border-emerald-600 shadow-sm text-center min-h-[65px]">
                        <span class="text-[9px] font-black text-emerald-700 uppercase tracking-tighter leading-none mb-1 break-words w-full px-1">${s.funcao}</span>
                        <span class="text-xs font-bold text-gray-800 leading-tight break-words w-full px-1">${s.nome}</span>
                    </div>
                `;
            } else {
                // Sem Função (Só o Nome Centralizado)
                htmlLista += `
                    <div class="flex items-center justify-center bg-gray-50 p-2 rounded border-l-4 border-emerald-600 shadow-sm text-center min-h-[65px]">
                        <span class="text-xs font-bold text-gray-800 leading-tight break-words w-full px-1">${s.nome}</span>
                    </div>
                `;
            }
        });
    } else {
        // MODO LISTA SOLENE
        listaContainer.className = "flex flex-col gap-3 w-full"; 
        
        servosEscalados.forEach(s => {
            if (s.funcao) {
                // Com Função
                htmlLista += `
                    <div class="flex flex-col items-center justify-center bg-gray-50 p-3 rounded border-l-4 border-emerald-600 shadow-sm text-center min-h-[70px]">
                        <span class="text-xs font-bold text-emerald-800 uppercase mb-1">${s.funcao}</span>
                        <span class="text-gray-900 font-bold text-xl break-words">${s.nome}</span>
                    </div>
                `;
            } else {
                // Sem Função (Só o Nome Centralizado em Destaque)
                htmlLista += `
                    <div class="flex items-center justify-center bg-gray-50 p-3 rounded border-l-4 border-emerald-600 shadow-sm text-center min-h-[70px]">
                        <span class="text-gray-900 font-bold text-xl break-words">${s.nome}</span>
                    </div>
                `;
            }
        });
    }

    listaContainer.innerHTML = htmlLista;

    const btnZap = document.querySelector('button[onclick="copiarZapModal()"]');
    const textoOriginal = btnZap.innerHTML;
    btnZap.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    try {
        const molde = document.getElementById('molde_imagem');
        const canvas = await html2canvas(molde, { backgroundColor: '#ffffff', scale: 2 });
        canvas.toBlob(async (blob) => {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            btnZap.innerHTML = textoOriginal;
            mostrarToast('📸 Escala limpa copiada para o WhatsApp!', 'sucesso');
        }, 'image/png');
    } catch (error) {
        btnZap.innerHTML = textoOriginal;
        alert('Erro ao gerar imagem.');
    }
}

function excluirEvento() {
    const idEvento = document.getElementById('modal_id_evento').value;
    if(confirm('Tem certeza? Isso apagará a celebração e a escala do calendário.')) {
        db.prepare('DELETE FROM escalas WHERE id_evento = ?').run(idEvento);
        db.prepare('DELETE FROM eventos WHERE id = ?').run(idEvento);
        fecharModal();
        renderizarCalendario();
    }
}

// ==========================================
// SISTEMA DE NOTIFICAÇÕES (IN-APP E WINDOWS)
// ==========================================

// 1. O Truque Ninja: Substituir o "alert" feio do sistema pelo nosso Toast bonito
window.alert = function(mensagem) {
    let tipo = 'sucesso'; // Verde por padrão
    
    // O sistema descobre sozinho se é um erro, aviso ou sucesso lendo a sua mensagem!
    const msgLower = mensagem.toLowerCase();
    if (msgLower.includes('erro') || msgLower.includes('obrigatório') || msgLower.includes('preencha')) {
        tipo = 'erro'; // Fica Vermelho
    } else if (msgLower.includes('aviso') || msgLower.includes('nenhuma missa') || msgLower.includes('vazia')) {
        tipo = 'aviso'; // Fica Amarelo
    }
    
    mostrarToast(mensagem, tipo);
};

function mostrarToast(mensagem, tipo) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    
    // Escolhendo cores e ícones
    const bgClass = tipo === 'erro' ? 'bg-red-600' : (tipo === 'aviso' ? 'bg-amber-500' : 'bg-emerald-600');
    const icon = tipo === 'erro' ? 'fa-times-circle' : (tipo === 'aviso' ? 'fa-exclamation-triangle' : 'fa-check-circle');

    toast.className = `${bgClass} text-white px-5 py-3 rounded-lg shadow-2xl flex items-center gap-3 transform transition-all duration-300 translate-y-10 opacity-0 max-w-sm`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="font-semibold text-sm">${mensagem}</span>`;

    container.appendChild(toast);

    // Animação de entrada (pula na tela)
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);

    // Tempo para sumir sozinho (4 segundos)
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300); // Remove do código após a animação
    }, 4000);
}

// 2. O Lembrete do Windows
function verificarLembretesDoWindows() {
    // Pede permissão ao Windows para mostrar notificações (só acontece na primeira vez)
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Pega a data de hoje e a data de daqui a 7 dias
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(hoje.getDate() + 7);

    const hojeStr = hoje.toISOString().split('T')[0];
    const limiteStr = limite.toISOString().split('T')[0];

    try {
        // Procura missas agendadas para os próximos 7 dias
        const proximosEventos = db.prepare(`SELECT id FROM eventos WHERE data >= ? AND data <= ?`).all(hojeStr, limiteStr);
        let missasSemEscala = 0;

        proximosEventos.forEach(ev => {
            // Conta se já tem alguém escalado nessa missa
            const temEscala = db.prepare(`SELECT count(*) as total FROM escalas WHERE id_evento = ?`).get(ev.id);
            if (temEscala.total === 0) {
                missasSemEscala++;
            }
        });

        // Se o Windows autorizou e temos missas vazias, dispara o lembrete!
        if (missasSemEscala > 0 && Notification.permission === "granted") {
            new Notification("Escala de Coroinhas", {
                body: `Você tem ${missasSemEscala} celebração(ões) nos próximos 7 dias que ainda estão sem servos escalados!`,
                icon: '1000509911.jpg' // Usa a logo do Santo Antônio!
            });
        }
    } catch (e) {
        console.log("Erro ao buscar lembretes:", e);
    }
}

// Inicialização
window.onload = () => {
    carregarListaCoroinhas();
    setTimeout(verificarLembretesDoWindows, 2000); // Espera 2 segundos após abrir e checa a agenda
};