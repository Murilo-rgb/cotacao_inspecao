const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'qualidade.html');
let content = fs.readFileSync(filePath, 'utf8');

// Add read-only auto-fill fields in the modal (after Cotação and Status readonly fields)
const camposAutoFill = `
                            // Campos auto-preenchidos (readonly)
                            React.createElement('div', { className: "border-t border-slate-200 pt-3 mt-3" },
                                React.createElement('h3', { className: "text-sm font-semibold text-slate-800 mb-2" }, 'Informações da Auditoria'),
                                React.createElement('div', { className: "grid grid-cols-3 gap-3" },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-xs font-medium text-slate-500 mb-0.5" }, 'Data Qualidade'),
                                        React.createElement('div', { className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" }, 
                                            auditForm.data_qualidade || new Date().toLocaleString('pt-BR')
                                        )
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-xs font-medium text-slate-500 mb-0.5" }, 'Semana'),
                                        React.createElement('div', { className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" }, 
                                            auditForm.semana || '-'
                                        )
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: "block text-xs font-medium text-slate-500 mb-0.5" }, 'Analista Qualidade'),
                                        React.createElement('div', { className: "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" }, 
                                            auditForm.analista_qualidade || '-'
                                        )
                                    )
                                )
                            ),
`;

// Insert after the readonly Cotação/Status section
const insertPoint = content.indexOf("                            // Campos de auditoria");
if (insertPoint !== -1) {
    content = content.slice(0, insertPoint) + camposAutoFill + content.slice(insertPoint);
    console.log('[PATCH] Campos auto-preenchidos adicionados ao modal');
}

// Update handleAuditClick to include auto-fill data
const oldHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
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

const newHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
                setAuditModal(quotation);
                const now = new Date();
                const semana = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
                const dataQualidade = now.toLocaleString('pt-BR');
                const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');
                const analistaQualidade = usuarioLogado.nome ? \`\${usuarioLogado.nome} \${usuarioLogado.sobrenome || ''}\`.trim() : '-';
                
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
                    data_envio: quotation.auditoria?.data_envio || '',
                    data_qualidade: dataQualidade,
                    semana: semana,
                    analista_qualidade: analistaQualidade
                });
            }, []);`;

if (content.includes(oldHandleAuditClick)) {
    content = content.replace(oldHandleAuditClick, newHandleAuditClick);
    console.log('[PATCH] handleAuditClick atualizado com auto-preenchimento');
}

// Save
fs.writeFileSync(filePath, content, 'utf8');
console.log('[PATCH] Auto-preenchimento configurado com sucesso!');
console.log('Campos auto-preenchidos: data_qualidade, semana, analista_qualidade');