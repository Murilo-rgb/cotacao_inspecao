const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'qualidade.html');
let content = fs.readFileSync(filePath, 'utf8');

// Novo modal de auditoria com todos os campos
const novoModal = `
                // Audit Modal
                auditModal && React.createElement('div', {
                    className: "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4",
                    onClick: (e) => { if (e.target === e.currentTarget) { setAuditModal(null); setAuditForm({ anotacao: '', status: '' }); } }
                },
                    React.createElement('div', { className: "bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl modal-content max-h-[90vh] overflow-y-auto" },
                        React.createElement('div', { className: "flex items-center justify-between mb-5" },
                            React.createElement('div', { className: "flex items-center gap-3" },
                                React.createElement('div', { className: "w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600" },
                                    React.createElement(ClipboardCheckIcon)
                                ),
                                React.createElement('div', null,
                                    React.createElement('h2', { className: "text-lg font-bold text-slate-800" }, 'Auditoria de Qualidade'),
                                    React.createElement('p', { className: "text-xs text-slate-500" }, 'Registrar auditoria para a cotação')
                                )
                            ),
                            React.createElement('button', {
                                onClick: () => { setAuditModal(null); setAuditForm({ anotacao: '', status: '' }); },
                                className: "p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                            }, React.createElement(XIcon))
                        ),

                        React.createElement('div', { className: "space-y-4" },
                            // Informações da Cotação (readonly)
                            React.createElement('div', { className: "grid grid-cols-2 gap-3" },
                                React.createElement('div', null,
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Cotação (Tarefa)'),
                                    React.createElement('div', { className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono" }, auditModal.tarefa || '-')
                                ),
                                React.createElement('div', null,
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Status'),
                                    React.createElement('div', { className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" }, auditModal.status || '-')
                                )
                            ),

                            // Campos de auditoria
                            React.createElement('div', { className: "border-t border-slate-200 pt-4 mt-4" },
                                React.createElement('h3', { className: "text-sm font-semibold text-slate-800 mb-3" }, 'Dados da Auditoria'),

                                // Reprova BKO
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Reprova BKO'),
                                    React.createElement('input', {
                                        type: "text",
                                        value: auditForm.reprova_bko || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, reprova_bko: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        placeholder: "Digite o motivo da reprova..."
                                    })
                                ),

                                // Apontamento
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Apontamento'),
                                    React.createElement('textarea', {
                                        value: auditForm.apontamento || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, apontamento: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200 resize-none",
                                        rows: "2",
                                        placeholder: "Digite o apontamento..."
                                    })
                                ),

                                // Motivos (3 campos)
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 1 - Sistema/Documento'),
                                    React.createElement('input', {
                                        type: "text",
                                        value: auditForm.motivo_1_sistema_documento || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, motivo_1_sistema_documento: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        placeholder: "Motivo 1..."
                                    })
                                ),
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 2 - Erro'),
                                    React.createElement('input', {
                                        type: "text",
                                        value: auditForm.motivo_2_erro || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, motivo_2_erro: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        placeholder: "Motivo 2..."
                                    })
                                ),
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 3 - Detalhamento'),
                                    React.createElement('input', {
                                        type: "text",
                                        value: auditForm.motivo_3_detalhamento || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, motivo_3_detalhamento: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        placeholder: "Motivo 3..."
                                    })
                                ),

                                // Contestação e Obs
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Contestação'),
                                    React.createElement('textarea', {
                                        value: auditForm.contestacao || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, contestacao: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200 resize-none",
                                        rows: "2",
                                        placeholder: "Digite a contestação..."
                                    })
                                ),
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Observação'),
                                    React.createElement('textarea', {
                                        value: auditForm.obs || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, obs: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200 resize-none",
                                        rows: "2",
                                        placeholder: "Digite a observação..."
                                    })
                                ),

                                // Regional e Tipo de Pedido
                                React.createElement('div', { className: "grid grid-cols-2 gap-3 mb-3" },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Regional'),
                                        React.createElement('input', {
                                            type: "text",
                                            value: auditForm.regional || '',
                                            onChange: (e) => setAuditForm({ ...auditForm, regional: e.target.value }),
                                            className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                            placeholder: "Regional..."
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Tipo de Pedido'),
                                        React.createElement('input', {
                                            type: "text",
                                            value: auditForm.tipo_de_pedido || '',
                                            onChange: (e) => setAuditForm({ ...auditForm, tipo_de_pedido: e.target.value }),
                                            className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                            placeholder: "Tipo de pedido..."
                                        })
                                    )
                                ),

                                // Seção de Envio
                                React.createElement('div', { className: "border-t border-slate-200 pt-3 mt-3" },
                                    React.createElement('h3', { className: "text-sm font-semibold text-slate-800 mb-2" }, 'Envio'),
                                    React.createElement('div', { className: "grid grid-cols-2 gap-3" },
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Enviado'),
                                            React.createElement('select', {
                                                value: auditForm.enviado || false,
                                                onChange: (e) => setAuditForm({ ...auditForm, enviado: e.target.value === 'true' }),
                                                className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200"
                                            },
                                                React.createElement('option', { value: 'false' }, 'Não'),
                                                React.createElement('option', { value: 'true' }, 'Sim')
                                            )
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Data de Envio'),
                                            React.createElement('input', {
                                                type: "datetime-local",
                                                value: auditForm.data_envio || '',
                                                onChange: (e) => setAuditForm({ ...auditForm, data_envio: e.target.value }),
                                                className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200"
                                            })
                                        )
                                    )
                                )
                            ),

                            // Status da Auditoria
                            React.createElement('div', { className: "border-t border-slate-200 pt-4 mt-4" },
                                React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1.5" }, 'Status da Auditoria'),
                                React.createElement('select', {
                                    value: auditForm.status,
                                    onChange: (e) => setAuditForm({ ...auditForm, status: e.target.value }),
                                    className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200"
                                },
                                    React.createElement('option', { value: '', disabled: true }, 'Selecione um status...'),
                                    (!auditModal.origem || auditModal.origem === 'r_000250')
                                        ? React.createElement(React.Fragment, null,
                                            React.createElement('option', { value: 'Procedimento Correto', className: "text-emerald-700" }, '✅ Procedimento Correto'),
                                            React.createElement('option', { value: 'Devolução Parcial', className: "text-amber-700" }, '⚠️ Devolução Parcial'),
                                            React.createElement('option', { value: 'Devolução Indevida', className: "text-red-700" }, '❌ Devolução Indevida')
                                          )
                                        : React.createElement(React.Fragment, null,
                                            React.createElement('option', { value: 'Procedimento Correto', className: "text-emerald-700" }, '✅ Procedimento Correto'),
                                            React.createElement('option', { value: 'Reprova Parcial', className: "text-amber-700" }, '⚠️ Reprova Parcial'),
                                            React.createElement('option', { value: 'Reprova Indevida', className: "text-red-700" }, '❌ Reprova Indevida'),
                                            React.createElement('option', { value: 'Aprovacao Indevida', className: "text-orange-700" }, '⚠️ Aprovação Indevida')
                                          )
                                )
                            ),

                            // Buttons
                            React.createElement('div', { className: "flex gap-3 pt-2" },
                                React.createElement('button', {
                                    onClick: handleAuditSave,
                                    disabled: saving,
                                    className: "flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 focus:ring-4 focus:ring-purple-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                },
                                    saving && React.createElement('svg', { className: "animate-spin h-4 w-4", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24" },
                                        React.createElement('circle', { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                                        React.createElement('path', { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
                                    ),
                                    saving ? 'Salvando...' : 'Salvar Auditoria'
                                ),
                                React.createElement('button', {
                                    onClick: () => { setAuditModal(null); setAuditForm({ anotacao: '', status: '' }); },
                                    className: "flex-1 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 focus:ring-4 focus:ring-slate-500/10 transition-all duration-200"
                                }, 'Cancelar')
                            )
                        )
                    )
                ),
`;

// Substituir o modal antigo pelo novo
const oldModalStart = '                // Audit Modal';
const oldModalEnd = '                // Toast';

if (content.includes(oldModalStart)) {
    const startIndex = content.indexOf(oldModalStart);
    const endIndex = content.indexOf(oldModalEnd, startIndex);
    
    if (startIndex !== -1 && endIndex !== -1) {
        content = content.slice(0, startIndex) + novoModal + '\n' + content.slice(endIndex);
        console.log('[PATCH] Modal de auditoria atualizado com sucesso');
    } else {
        console.error('[PATCH] Não foi possível localizar os limites do modal');
    }
} else {
    console.error('[PATCH] Modal não encontrado');
}

// Atualizar o estado inicial do formulário de auditoria para incluir todos os campos
const oldFormState = "const [auditForm, setAuditForm] = useState({ anotacao: '', status: '' });";
const newFormState = "const [auditForm, setAuditForm] = useState({ anotacao: '', status: '', reprova_bko: '', apontamento: '', motivo_1_sistema_documento: '', motivo_2_erro: '', motivo_3_detalhamento: '', contestacao: '', obs: '', regional: '', tipo_de_pedido: '', enviado: false, data_envio: '' });";

if (content.includes(oldFormState)) {
    content = content.replace(oldFormState, newFormState);
    console.log('[PATCH] Estado do formulário atualizado');
}

// Atualizar a função handleAuditClick para incluir os novos campos
const oldHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
                setAuditModal(quotation);
                setAuditForm({
                    anotacao: quotation.auditoria?.anotacao || '',
                    status: quotation.auditoria?.status || ''
                });
            }, []);`;

const newHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
                setAuditModal(quotation);
                setAuditForm({
                    anotacao: quotation.auditoria?.anotacao || '',
                    status: quotation.auditoria?.status || '',
                    reprova_bko: quotation.auditoria?.reprova_bko || '',
                    apontamento: quotation.auditoria?.apontamento || '',
                    motivo_1_sistema_documento: quotation.auditoria?.motivo_1_sistema_documento || '',
                    motivo_2_erro: quotation.auditoria?.motivo_2_erro || '',
                    motivo_3_detalhamento: quotation.auditoria?.motivo_3_detalhamento || '',
                    contestacao: quotation.auditoria?.contestacao || '',
                    obs: quotation.auditoria?.obs || '',
                    regional: quotation.auditoria?.regional || '',
                    tipo_de_pedido: quotation.auditoria?.tipo_de_pedido || '',
                    enviado: quotation.auditoria?.enviado || false,
                    data_envio: quotation.auditoria?.data_envio || ''
                });
            }, []);`;

if (content.includes(oldHandleAuditClick)) {
    content = content.replace(oldHandleAuditClick, newHandleAuditClick);
    console.log('[PATCH] handleAuditClick atualizado');
}

// Atualizar a função handleAuditSave para enviar todos os campos
const oldHandleAuditSave = `const handleAuditSave = useCallback(async () => {
                if (!auditModal) return;
                
                if (!auditForm.status) {
                    showToast('Selecione um status para a auditoria', 'error');
                    return;
                }

                setSaving(true);
                const token = localStorage.getItem('token');
                
                try {
                    const response = await fetch(\`\${BASE_PATH}/api/qualidade/auditar\`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': \`Bearer \${token}\` 
                        },
                        body: JSON.stringify({
                            id_cotacao: auditModal.id_cotacao,
                            anotacao: auditForm.anotacao,
                            status: auditForm.status
                        })
                    });

                    if (response.status === 401 || response.status === 403) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('username');
                        window.location.href = BASE_PATH + '/login.html';
                        return;
                    }

                    if (response.ok) {
                        setAuditModal(null);
                        setAuditForm({ anotacao: '', status: '' });
                        showToast('Auditoria salva com sucesso');
                        fetchQuotations();
                    } else {
                        const err = await response.json();
                        showToast(err.error || 'Erro ao salvar auditoria', 'error');
                    }
                } catch (error) {
                    console.error('Erro ao salvar auditoria:', error);
                    showToast('Erro ao salvar auditoria', 'error');
                } finally {
                    setSaving(false);
                }
            }, [auditModal, auditForm, BASE_PATH, showToast, fetchQuotations]);`;

const newHandleAuditSave = `const handleAuditSave = useCallback(async () => {
                if (!auditModal) return;
                
                if (!auditForm.status) {
                    showToast('Selecione um status para a auditoria', 'error');
                    return;
                }

                setSaving(true);
                const token = localStorage.getItem('token');
                
                try {
                    const response = await fetch(\`\${BASE_PATH}/api/qualidade/auditar-completo\`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': \`Bearer \${token}\` 
                        },
                        body: JSON.stringify({
                            id_cotacao: auditModal.id_cotacao,
                            reprova_bko: auditForm.reprova_bko,
                            apontamento: auditForm.apontamento,
                            motivo_1_sistema_documento: auditForm.motivo_1_sistema_documento,
                            motivo_2_erro: auditForm.motivo_2_erro,
                            motivo_3_detalhamento: auditForm.motivo_3_detalhamento,
                            contestacao: auditForm.contestacao,
                            obs: auditForm.obs,
                            regional: auditForm.regional,
                            tipo_de_pedido: auditForm.tipo_de_pedido,
                            enviado: auditForm.enviado,
                            data_envio: auditForm.data_envio,
                            status: auditForm.status
                        })
                    });

                    if (response.status === 401 || response.status === 403) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('username');
                        window.location.href = BASE_PATH + '/login.html';
                        return;
                    }

                    if (response.ok) {
                        setAuditModal(null);
                        setAuditForm({ anotacao: '', status: '', reprova_bko: '', apontamento: '', motivo_1_sistema_documento: '', motivo_2_erro: '', motivo_3_detalhamento: '', contestacao: '', obs: '', regional: '', tipo_de_pedido: '', enviado: false, data_envio: '' });
                        showToast('Auditoria salva com sucesso');
                        fetchQuotations();
                    } else {
                        const err = await response.json();
                        showToast(err.error || 'Erro ao salvar auditoria', 'error');
                    }
                } catch (error) {
                    console.error('Erro ao salvar auditoria:', error);
                    showToast('Erro ao salvar auditoria', 'error');
                } finally {
                    setSaving(false);
                }
            }, [auditModal, auditForm, BASE_PATH, showToast, fetchQuotations]);`;

if (content.includes(oldHandleAuditSave)) {
    content = content.replace(oldHandleAuditSave, newHandleAuditSave);
    console.log('[PATCH] handleAuditSave atualizado');
}

// Salvar arquivo
fs.writeFileSync(filePath, content, 'utf8');
console.log('[PATCH] qualidade.html atualizado com sucesso!');
console.log('Alterações:');
console.log('  - Modal de auditoria expandido com todos os campos');
console.log('  - Campos adicionados: reprova_bko, apontamento, motivos 1-3, contestação, obs, regional, tipo_de_pedido, enviado, data_envio');
console.log('  - Rota atualizada para /api/qualidade/auditar-completo');
console.log('  - Estado do formulário inicializado com todos os campos');