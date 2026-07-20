const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'qualidade.html');
let content = fs.readFileSync(htmlPath, 'utf8');

// 1. Atualizar handleAuditClick
const oldHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
                setAuditModal(quotation);
                setAuditForm({
                    anotacao: quotation.auditoria?.anotacao || '',
                    status: quotation.auditoria?.status || ''
                });
            }, []);`;

const newHandleAuditClick = `const handleAuditClick = useCallback((quotation) => {
                setAuditModal(quotation);
                const now = new Date();
                const day = now.getDate();
                const month = now.getMonth();
                const year = now.getFullYear();
                const firstDay = new Date(year, month, 1);
                const firstDayWeek = firstDay.getDay();
                const startDay = firstDayWeek === 0 ? 0 : firstDayWeek;
                const semana = Math.ceil((day + startDay) / 7);
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
    console.log('[PATCH] handleAuditClick atualizado com sucesso');
} else {
    console.log('[PATCH] handleAuditClick não encontrado');
}

// 2. Atualizar handleAuditSave
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
    console.log('[PATCH] handleAuditSave atualizado com sucesso');
} else {
    console.log('[PATCH] handleAuditSave não encontrado');
}

// Salvar
fs.writeFileSync(htmlPath, content, 'utf8');
console.log('\n[PATCH] Concluído!');
console.log('Funções handleAuditClick e handleAuditSave atualizadas');