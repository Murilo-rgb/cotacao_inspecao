
        const { useState, useEffect, useCallback } = React;

        // === Icons ===
        const SearchIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('circle', { cx: "11", cy: "11", r: "8" }),
                React.createElement('path', { d: "m21 21-4.35-4.35" })
            )
        );

        const CalendarIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('rect', { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }),
                React.createElement('line', { x1: "16", y1: "2", x2: "16", y2: "6" }),
                React.createElement('line', { x1: "8", y1: "2", x2: "8", y2: "6" }),
                React.createElement('line', { x1: "3", y1: "10", x2: "21", y2: "10" })
            )
        );

        const UserIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M19 21v-2a4 4 0 0 0-4-4H9a2 2 0 0 0-4 4v2" }),
                React.createElement('circle', { cx: "12", cy: "7", r: "4" })
            )
        );

        const LogoutIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
                React.createElement('polyline', { points: "16 17 21 12 16 7" }),
                React.createElement('line', { x1: "21", x2: "9", y1: "12", y2: "12" })
            )
        );

        const AuditIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" }),
                React.createElement('rect', { x: "9", y: "3", width: "6", height: "4", rx: "1" }),
                React.createElement('path', { d: "M9 14l2 2 4-4" })
            )
        );

        const MOTIVOS_SUBMOTIVOS = {
            'Isento': {
                'Assinatura': [],
                'Assinatura_Manual': [],
                'Falta_assinatura': [],
                'Fora_dos_Padrões': []
            },
            'Comprovante_de_Endereço': {
                'Documento_Incompleto': [],
                'Documento_Vencido': [],
                'Falta_documento': [],
                'Fora_dos_padrões': [],
                'Não_pertence': ['À_Cotação', 'Ao_CNPJ', 'Ao_Receptor', 'Ao_Doador', 'Ao_Representante'],
                'IdDocusign': [],
                'Ilegível': [],
                'ID_não_Localizado': [],
                'Falta_ID': []
            },
            'Contrato_de_Permanência': {
                'Assinatura': [],
                'Data': [],
                'Documento_Incompleto': [],
                'Documento_Vencido': [],
                'Falta_documento': [],
                'Id_Docusign': [],
                'Fora_dos_padrões': [],
                'Local': [],
                'Duplicada': [],
                'Ilegível': [],
                'Não_preenchido': [],
                'Diverge': []
            },
            'Contrato_Social': {
                'Assinatura_não_autenticada': [],
                'Documento_Incompleto': [],
                'Falta_documento': [],
                'Falta_Representante_Legal': [],
                'Falta_Selo_da_Junta': [],
                'Fora_dos_padrões': [],
                'Local': [],
                'Ilegível': [],
                'Não_preenchido': []
            },
            'Cotação_Detalhada': {
                'Aparelho': [],
                'Dados_Cadastrais': [],
                'Dados_da_Revenda': [],
                'Endereço': [],
                'Franquias': [],
                'Linhas': [],
                'Ordens': [],
                'CNAE': [],
                'CNPJ': [],
                'Inscrição_Estadual': [],
                'Razão_Social': [],
                'Representante_legal': []
            },
            'Documento_do_Sócio': {
                'Documento_Incompleto': [],
                'Falta_documento': [],
                'Fora_dos_padrões': [],
                'Não_pertence': [],
                'Ordens': [],
                'Falta_SVA': [],
                'Reason_Incorreta': []
            },
            'Email_de_Autorização': {
                'Documento_Incompleto': [],
                'Documento_Vencido': [],
                'Falta_documento': [],
                'Fora_dos_padrões': [],
                'Não_pertence': [],
                'Não_possui_alçada': [],
                'Franquias': [],
                'Diverge': [],
                'Valor': [],
                'Não_apto': []
            },
            'Mobile': {
                'Estrutura_Incorreta': ['BAN', 'CC', 'DPTO', 'ID_Cliente', 'Completa'],
                'Criação_de_Estrutura': [],
                'Endereço': [],
                'Entrega': [],
                'Incompleto': [],
                'Negociado': [],
                'Principal': []
            },
            'Planilha_de_Produtos_Instalados': {
                'Descrição': [],
                'Documento_com_erro': [],
                'Documento_Vencido': [],
                'Falta_documento': [],
                'Incompleto': [],
                'Titulo': [],
                'Linhas': [],
                'Fora_dos_padrões': [],
                'Aparelho': [],
                'Cor': [],
                'Modelo': [],
                'Quantidade': [],
                'Valor': []
            },
            'Print_do_Relatório_de_Relacionamento': {
                'Documento_com_erro': [],
                'Documento_Vencido': [],
                'Falta_documento': [],
                'Documento_Incompleto': [],
                'Fora_dos_padrões': [],
                'Linhas': [],
                'Doador': [],
                'Número': [],
                'Operadora': [],
                'Quantidade': []
            },
            'Tcpj': {
                'Administrador': [],
                'Aparelho': [],
                'Assinatura': [],
                'Check_Box': [],
                'Dados_Cadastrais': [],
                'Dados_da_Revenda': ['Código_da_Revenda', 'Fora_dos_padrões', 'Incompleto', 'Segmento'],
                'Data': [],
                'Documento_Incompleto': [],
                'Documento_Vencido': [],
                'Endereço': [],
                'Falta_documento': [],
                'Fora_dos_padrões': [],
                'Franquias': [],
                'Código_único': [],
                'Id_Docusign': [],
                'Ilegível': [],
                'Linhas': [],
                'Local': [],
                'Não_pertence': []
            },
            'Regras_de_Negócio': {
                'Forma_de_pagamento': ['Sem_tempo_médio', 'Incorreta', 'Diverge'],
                'Inapto_a_Renovação': ['Falta_email'],
                'Inapto_a_Transferência': ['Falta_email'],
                'Mega_Bônus': [],
                'Sim_Cards': [],
                'Franquia_Descontinuada': ['Falta_email'],
                'Transferência_Parcial': ['Falta_email', 'Quantidade_de_linhas'],
                'Renovação_Parcial': ['Falta_email', 'Quantidade_de_linhas'],
                'Transferência_Massa': [],
                'NBO': [],
                'Documento_Incompleto': [],
                'Falta_Páginas': [],
                'Falta_parte_da_frente': [],
                'Falta_parte_de_trás': [],
                'Falta_QRcode': [],
                'Falta_campos': [],
                'Campos_vazios': []
            },
            'Solar': {
                'Documento_Manual': [],
                'Documento_Solar': [],
                'Mega_Bônus': [],
                'Não_apto': [],
                'Preenchido_Incorreto': []
            },
            'Evidência': {
                'Fora_dos_padrões': [],
                'Incompleta': ['Receita Federal', 'Inscrição Estadual', 'CCC/SINTEGRA', 'Valores Totais', 'Motivo da Reprova'],
                'Não_enviada': [],
                'Check_Box': [],
                'Não_preenchido': [],
                'Cliente_Novo': []
            },
            'Etiqueta_Padrão': {
                'Fora_dos_padrões': [],
                'Incompleta': [],
                'Não_enviada': [],
                'Oferta_diverge': [],
                'Administrador': [],
                'E-Mail_Administrador': [],
                'Telefone_Administrador': [],
                'Nome_Administrador': [],
                'Quantidade_Administrador': [],
                'Diverge_Administrador': [],
                'E-mail_duplicado': []
            },
            'TCO': {
                'Não_enviada': [],
                'Fora_dos_padrões': [],
                'Editada': [],
                'Cortada': [],
                'Rasurada': [],
                'Anexo': [],
                'Ilegível': [],
                'Regra RCG': []
            }
        };

        const CheckIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('polyline', { points: "20 6 9 17 4 12" })
            )
        );

        const AlertTriangleIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" }),
                React.createElement('path', { d: "M12 9v4" }),
                React.createElement('path', { d: "M12 17h.01" })
            )
        );

        const InspectIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "text-blue-600" },
                React.createElement('circle', { cx: "11", cy: "11", r: "8" }),
                React.createElement('path', { d: "m21 21-4.35-4.35" })
            )
        );

        const InputIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "text-emerald-600" },
                React.createElement('path', { d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }),
                React.createElement('polyline', { points: "14 2 14 8 20 8" }),
                React.createElement('line', { x1: "16", x2: "8", y1: "13", y2: "13" }),
                React.createElement('line', { x1: "16", x2: "8", y1: "17", y2: "17" })
            )
        );

        const TopIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "text-purple-600" },
                React.createElement('polyline', { points: "18 15 12 9 6 15" })
            )
        );

        const XIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M18 6 6 18" }),
                React.createElement('path', { d: "m6 6 12 12" })
            )
        );

        const FileTextIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }),
                React.createElement('polyline', { points: "14 2 14 8 20 8" }),
                React.createElement('line', { x1: "16", x2: "8", y1: "13", y2: "13" }),
                React.createElement('line', { x1: "16", x2: "8", y1: "17", y2: "17" }),
                React.createElement('line', { x1: "10", x2: "8", y1: "9", y2: "9" })
            )
        );

        const ClipboardCheckIcon = () => (
            React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement('path', { d: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" }),
                React.createElement('rect', { x: "9", y: "3", width: "6", height: "4", rx: "1" }),
                React.createElement('path', { d: "m9 14 2 2 4-4" })
            )
        );

        // === Toast Component ===
        function Toast({ message, type, onClose }) {
            useEffect(() => {
                const timer = setTimeout(onClose, 3000);
                return () => clearTimeout(timer);
            }, [onClose]);

            return React.createElement('div', { 
                className: `fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 toast-enter ${
                    type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }` 
            },
                type === 'success' ? React.createElement(CheckIcon) : React.createElement(AlertTriangleIcon),
                React.createElement('span', { className: "font-medium text-sm" }, message)
            );
        }

        // === Main App ===
        function App() {
            const [quotations, setQuotations] = useState([]);
            const [loading, setLoading] = useState(true);
            const [searchTerm, setSearchTerm] = useState('');
            const [dateStart, setDateStart] = useState('');
            const [filtroOrigem, setFiltroOrigem] = useState('');
            const [filtroStatus, setFiltroStatus] = useState('');
            const [currentPage, setCurrentPage] = useState(1);
            const [itemsPerPage] = useState(15);
            const [auditModal, setAuditModal] = useState(null);
            const [auditForm, setAuditForm] = useState({ anotacao: '', status: '', reprova_bko: '', apontamento: '', motivo_1_sistema_documento: '', motivo_2_erro: '', motivo_3_detalhamento: '', contestacao: '', obs: '', regional: '', tipo_de_pedido: '', enviado: false, data_envio: '' });
            const [username, setUsername] = useState('');
            const [toast, setToast] = useState(null);
            const [saving, setSaving] = useState(false);

            const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';

            useEffect(() => {
                const token = localStorage.getItem('token');
                if (!token) {
                    window.location.href = BASE_PATH + '/login.html';
                    return;
                }
                const storedUsername = localStorage.getItem('username');
                if (storedUsername) setUsername(storedUsername);
                fetchQuotations();
            }, []);

            useEffect(() => {
                setCurrentPage(1);
            }, [searchTerm, dateStart, filtroOrigem, filtroStatus]);

            const formatDateTimeLocal = (value) => {
                if (!value) return '';
                let d;
                if (typeof value === 'string') {
                    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
                    d = new Date(value);
                } else {
                    d = new Date(value);
                }
                if (isNaN(d.getTime())) return '';
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };

            const showToast = useCallback((message, type = 'success') => setToast({ message, type }), []);

            const fetchQuotations = useCallback(async () => {
                try {
                    setLoading(true);
                    const token = localStorage.getItem('token');
                    const params = new URLSearchParams();
                    if (searchTerm) params.append('search', searchTerm);
                    if (dateStart) params.append('dateStart', dateStart);
                    if (filtroOrigem) params.append('origem', filtroOrigem);
                    if (filtroStatus) params.append('status', filtroStatus);
                    
                    const response = await fetch(`${BASE_PATH}/api/qualidade?${params}`, { 
                        headers: { 'Authorization': `Bearer ${token}` } 
                    });
                    
                    if (response.status === 401 || response.status === 403) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('username');
                        window.location.href = BASE_PATH + '/login.html';
                        return;
                    }
                    
                    const data = await response.json();
                    setQuotations(data);
                } catch (error) {
                    console.error('Erro ao buscar cotações:', error);
                    showToast('Erro ao carregar cotações', 'error');
                } finally {
                    setLoading(false);
                }
            }, [searchTerm, dateStart, filtroOrigem, filtroStatus, BASE_PATH, showToast]);

            useEffect(() => {
                const timer = setTimeout(fetchQuotations, 300);
                return () => clearTimeout(timer);
            }, [fetchQuotations]);

            const handleLogout = useCallback(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                window.location.href = BASE_PATH + '/login.html';
            }, [BASE_PATH]);

            const handleAuditClick = useCallback((quotation) => {
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
                const analistaQualidade = usuarioLogado.nome ? `${usuarioLogado.nome} ${usuarioLogado.sobrenome || ''}`.trim() : '-';
                
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
                        data_envio: formatDateTimeLocal(quotation.auditoria?.data_envio),
                        data_qualidade: dataQualidade,
                        semana: semana,
                        analista_qualidade: analistaQualidade
                    });
            }, []);

            const handleAuditSave = useCallback(async () => {
                if (!auditModal) return;
                
                if (!auditForm.status) {
                    showToast('Selecione um status para a auditoria', 'error');
                    return;
                }
 
                setSaving(true);
                const token = localStorage.getItem('token');
                
                try {
                    const response = await fetch(`${BASE_PATH}/api/qualidade/auditar-completo`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
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
            }, [auditModal, auditForm, BASE_PATH, showToast, fetchQuotations]);

            const getStatusBadge = (status) => {
                const normalized = (status || '').trim().toLowerCase();
                if (normalized === 'aprovado') {
                    return { label: 'Aprovado', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
                }
                if (normalized === 'reprovado' || normalized === 'reprovado') {
                    return { label: 'Reprovado', bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
                }
                if (normalized === 'reprovado' || normalized === 'reprova indevida') {
                    return { label: 'Reprova indevida', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
                }
                return { label: status || 'Pendente', bg: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
            };

            const getAuditStatusBadge = (status) => {
                const s = (status || '').trim();
                if (s === 'Procedimento Correto') {
                    return { label: 'Procedimento Correto', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
                }
                if (s === 'Devolução Parcial') {
                    return { label: 'Devolução Parcial', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
                }
                if (s === 'Devolução Indevida') {
                    return { label: 'Devolução Indevida', bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
                }
                if (s === 'Reprova Parcial') {
                    return { label: 'Reprova Parcial', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
                }
                if (s === 'Reprova Indevida') {
                    return { label: 'Reprova Indevida', bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
                }
                if (s === 'Aprovacao Indevida') {
                    return { label: 'Aprovacao Indevida', bg: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
                }
                return null;
            };

            const formatDate = (dateString) => {
                if (!dateString || dateString === '-') return '-';
                try {
                    return dateString;
                } catch { return dateString; }
            };

            const filteredQuotations = quotations.filter(q => {
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    if (!(q.usuario_login && q.usuario_login.toLowerCase().includes(term))) return false;
                }
                return true;
            });

            const indexOfLastItem = currentPage * itemsPerPage;
            const indexOfFirstItem = indexOfLastItem - itemsPerPage;
            const currentQuotations = filteredQuotations.slice(indexOfFirstItem, indexOfLastItem);
            const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);

            const SkeletonRow = () => React.createElement('tr', { className: "animate-pulse" },
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-4 bg-slate-200 rounded w-20" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-4 bg-slate-200 rounded w-40" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-4 bg-slate-200 rounded w-32" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-4 bg-slate-200 rounded w-24" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-4 bg-slate-200 rounded w-20" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-6 bg-slate-200 rounded-full w-20" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-6 bg-slate-200 rounded-full w-20" })),
                React.createElement('td', { className: "px-4 py-3" }, React.createElement('div', { className: "h-8 w-8 bg-slate-200 rounded-lg" }))
            );

            return React.createElement('div', { className: "min-h-screen bg-slate-50/80" },
                React.createElement('header', { className: "bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30" },
                    React.createElement('div', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" },
                        React.createElement('div', { className: "flex justify-between items-center h-16" },
                            React.createElement('div', { className: "flex items-center gap-3" },
                                React.createElement('div', { className: "w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md" },
                                    React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
                                        React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" })
                                    )
                                ),
                                React.createElement('div', null,
                                    React.createElement('h1', { className: "text-xl font-bold text-slate-800" }, 'Auditoria de Qualidade'),
                                    React.createElement('p', { className: "text-xs text-slate-500" }, 'Controle de auditoria das cotações')
                                )
                            ),
                            React.createElement('div', { className: "flex items-center gap-4" },
                                React.createElement('div', { className: "hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full shadow-sm" },
                                    React.createElement('div', { className: "w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-sm" },
                                        React.createElement(UserIcon)
                                    ),
                                    React.createElement('span', { className: "text-sm font-semibold text-white" }, username)
                                ),
                                React.createElement('button', { onClick: handleLogout, className: "flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200" },
                                    React.createElement(LogoutIcon),
                                    React.createElement('span', { className: "hidden sm:inline" }, 'Sair')
                                )
                            )
                        )
                    )
                ),

                React.createElement('main', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" },
                    React.createElement('div', { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" },
                        React.createElement('div', { className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm" },
                            React.createElement('p', { className: "text-sm font-medium text-slate-500" }, 'Total de Cotações'),
                            React.createElement('p', { className: "text-2xl font-bold text-slate-800 mt-1" }, filteredQuotations.length)
                        ),
                        React.createElement('div', { className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm" },
                            React.createElement('p', { className: "text-sm font-medium text-emerald-600" }, 'Auditadas'),
                            React.createElement('p', { className: "text-2xl font-bold text-emerald-700 mt-1" }, filteredQuotations.filter(q => q.auditoria).length)
                        ),
                        React.createElement('div', { className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm" },
                            React.createElement('p', { className: "text-sm font-medium text-amber-600" }, 'Não Auditadas'),
                            React.createElement('p', { className: "text-2xl font-bold text-amber-700 mt-1" }, filteredQuotations.filter(q => !q.auditoria).length)
                        ),
                        React.createElement('div', { className: "bg-white rounded-xl p-4 border border-slate-200 shadow-sm" },
                            React.createElement('p', { className: "text-sm font-medium text-red-600" }, 'Reprovadas'),
                            React.createElement('p', { className: "text-2xl font-bold text-red-700 mt-1" }, filteredQuotations.filter(q => q.auditoria && q.auditoria.status === 'Reprovado').length)
                        )
                    ),

                    React.createElement('div', { className: "flex flex-col sm:flex-row gap-4 mb-6" },
                        React.createElement('div', { className: "flex-1 relative group" },
                            React.createElement('div', { className: "absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" },
                                React.createElement(SearchIcon)
                            ),
                            React.createElement('input', {
                                type: "text",
                                placeholder: "Buscar por usuário...",
                                value: searchTerm,
                                onChange: (e) => setSearchTerm(e.target.value),
                                className: "w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
                            })
                        ),
                        React.createElement('div', { className: "relative group" },
                            React.createElement('div', { className: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" },
                                React.createElement(CalendarIcon)
                            ),
                            React.createElement('input', {
                                type: "date",
                                value: dateStart,
                                onChange: (e) => setDateStart(e.target.value),
                                className: "w-40 pl-10 pr-3 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
                            })
                        ),
                        React.createElement('div', { className: "relative group" },
                            React.createElement('select', {
                                value: filtroOrigem,
                                onChange: (e) => setFiltroOrigem(e.target.value),
                                className: "w-44 px-3.5 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
                            },
                                React.createElement('option', { value: '' }, 'Todas as origens'),
                                React.createElement('option', { value: 'r_000250' }, '🔍 Inspeção'),
                                React.createElement('option', { value: 'iw_cpc_975_net' }, '📄 Input'),
                                React.createElement('option', { value: 'iw_cpc_975_top' }, '⬆️ TOP')
                            )
                        ),
                        React.createElement('div', { className: "relative group" },
                            React.createElement('select', {
                                value: filtroStatus,
                                onChange: (e) => setFiltroStatus(e.target.value),
                                className: "w-44 px-3.5 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
                            },
                                React.createElement('option', { value: '' }, 'Todos os status'),
                                React.createElement('option', { value: 'reprovado' }, 'Reprovado'),
                                React.createElement('option', { value: 'aprovado' }, 'Aprovado'),
                                React.createElement('option', { value: 'pendente' }, 'Pendente')
                            )
                        )
                    ),

                    React.createElement('div', { className: "bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" },
                        loading
                            ? React.createElement('div', { className: "overflow-x-auto" },
                                React.createElement('table', { className: "min-w-full divide-y divide-slate-200" },
                                    React.createElement('thead', { className: "bg-slate-50" },
                                        React.createElement('tr', null,
                                            React.createElement('th', { className: "px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Origem'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Tarefa'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Cotação'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Status'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Usuário'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Criação'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Auditoria'),
                                            React.createElement('th', { className: "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Ações')
                                        )
                                    ),
                                    React.createElement('tbody', { className: "bg-white divide-y divide-slate-100" },
                                        [...Array(5)].map((_, i) => React.createElement(SkeletonRow, { key: i }))
                                    )
                                )
                            )
                            : filteredQuotations.length === 0
                                ? React.createElement('div', { className: "p-12 text-center" },
                                    React.createElement('div', { className: "inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl text-slate-400 mb-4" },
                                        React.createElement(FileTextIcon)
                                    ),
                                    React.createElement('h3', { className: "text-lg font-semibold text-slate-800 mb-1" }, 'Nenhuma cotação encontrada'),
                                    React.createElement('p', { className: "text-slate-500 text-sm" }, 'Tente ajustar sua busca.')
                                )
                                : React.createElement('div', { className: "overflow-x-auto" },
                                    React.createElement('table', { className: "min-w-full divide-y divide-slate-200" },
                                        React.createElement('thead', { className: "bg-slate-50" },
                                            React.createElement('tr', null,
                                                React.createElement('th', { className: "px-2 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Origem'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Tarefa'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Cotação'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Status'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Usuário'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Criação'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Auditoria'),
                                                React.createElement('th', { className: "px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider" }, 'Ações')
                                            )
                                        ),
                                        React.createElement('tbody', { className: "bg-white divide-y divide-slate-100" },
                                            currentQuotations.map((q) => {
                                                const statusConf = getStatusBadge(q.status);
                                                const auditConf = getAuditStatusBadge(q.auditoria?.status);
                                                return React.createElement('tr', { key: q.cotacao || q.tarefa, className: "hover:bg-slate-50/80 transition-colors duration-150" },
                                                    React.createElement('td', { className: "px-2 py-3 whitespace-nowrap" },
                                                        (!q.origem || q.origem === 'r_000250')
                                                            ? React.createElement('span', { title: "Inspeção", className: "inline-flex items-center justify-center w-8 h-8 bg-blue-50 rounded-lg cursor-help" }, React.createElement(InspectIcon))
                                                            : q.origem === 'iw_cpc_975_net'
                                                                ? React.createElement('span', { title: "Input", className: "inline-flex items-center justify-center w-8 h-8 bg-emerald-50 rounded-lg cursor-help" }, React.createElement(InputIcon))
                                                                : q.origem === 'iw_cpc_975_top'
                                                                    ? React.createElement('span', { title: "TOP", className: "inline-flex items-center justify-center w-8 h-8 bg-purple-50 rounded-lg cursor-help" }, React.createElement(TopIcon))
                                                                    : React.createElement('span', { title: "Inspeção", className: "inline-flex items-center justify-center w-8 h-8 bg-blue-50 rounded-lg cursor-help" }, React.createElement(InspectIcon))
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap" },
                                                        React.createElement('span', { className: "text-sm font-semibold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded-md" }, q.tarefa || '-')
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3" },
                                                        React.createElement('p', { className: "text-sm text-slate-700 max-w-xs truncate", title: q.cotacao }, q.cotacao || '-')
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap" },
                                                        React.createElement('span', { className: `inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${statusConf.bg}` },
                                                            React.createElement('span', { className: `w-1.5 h-1.5 rounded-full ${statusConf.dot}` }),
                                                            statusConf.label
                                                        )
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap" },
                                                        React.createElement('span', { className: "text-sm text-slate-600" }, q.usuario_nome || q.usuario_login || '-')
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap text-sm text-slate-500" }, formatDate(q.data_de_criacao)),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap" },
                                                        auditConf
                                                            ? React.createElement('span', { className: `inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${auditConf.bg}` },
                                                                React.createElement('span', { className: `w-1.5 h-1.5 rounded-full ${auditConf.dot}` }),
                                                                auditConf.label
                                                            )
                                                            : React.createElement('span', { className: "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border bg-slate-50 text-slate-400 border-slate-200" },
                                                                React.createElement('span', { className: "w-1.5 h-1.5 rounded-full bg-slate-300" }),
                                                                'Não auditada'
                                                            )
                                                    ),
                                                    React.createElement('td', { className: "px-4 py-3 whitespace-nowrap" },
                                                        React.createElement('button', {
                                                            onClick: () => handleAuditClick(q),
                                                            className: `group p-2 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md ${
                                                                q.auditoria 
                                                                    ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white' 
                                                                    : 'text-purple-600 bg-purple-50 hover:bg-purple-600 hover:text-white'
                                                            }`,
                                                            title: q.auditoria ? 'Editar auditoria' : 'Auditar cotação'
                                                        },
                                                            React.createElement(ClipboardCheckIcon)
                                                        )
                                                    )
                                                );
                                            })
                                        )
                                    )
                                )
                    ),

                    totalPages > 1 && React.createElement('div', { className: "flex items-center justify-between mt-6 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm" },
                        React.createElement('p', { className: "text-sm text-slate-500 hidden sm:block" },
                            'Mostrando ', React.createElement('span', { className: "font-medium" }, indexOfFirstItem + 1),
                            ' a ', React.createElement('span', { className: "font-medium" }, Math.min(indexOfLastItem, filteredQuotations.length)),
                            ' de ', React.createElement('span', { className: "font-medium" }, filteredQuotations.length), ' resultados'
                        ),
                        React.createElement('div', { className: "flex items-center gap-2 mx-auto sm:mx-0" },
                            React.createElement('button', {
                                onClick: () => setCurrentPage(p => Math.max(1, p - 1)),
                                disabled: currentPage === 1,
                                className: "px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            }, 'Anterior'),
                            React.createElement('div', { className: "flex items-center gap-1" },
                                [...Array(totalPages)].map((_, i) => {
                                    const page = i + 1;
                                    return React.createElement('button', {
                                        key: page,
                                        onClick: () => setCurrentPage(page),
                                        className: `w-9 h-9 text-sm font-medium rounded-lg transition-colors duration-200 ${
                                            currentPage === page ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                        }`
                                    }, page);
                                })
                            ),
                            React.createElement('button', {
                                onClick: () => setCurrentPage(p => Math.min(totalPages, p + 1)),
                                disabled: currentPage === totalPages,
                                className: "px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            }, 'Próxima')
                        )
                    )
                ),

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
                            React.createElement('div', { className: "border-t border-slate-200 pt-4 mt-4" },
                                React.createElement('h3', { className: "text-sm font-semibold text-slate-800 mb-3" }, 'Dados da Auditoria'),

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

                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 1 - Sistema/Documento'),
                                    React.createElement('select', {
                                        value: auditForm.motivo_1_sistema_documento || '',
                                        onChange: (e) => {
                                            const motivo1 = e.target.value;
                                            setAuditForm(prev => ({ ...prev, motivo_1_sistema_documento: motivo1, motivo_3_detalhamento: '', motivo_2_erro: '' }));
                                        },
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200"
                                    },
                                        React.createElement('option', { value: '' }, 'Selecione...'),
                                        Object.keys(MOTIVOS_SUBMOTIVOS).map(motivo =>
                                            React.createElement('option', { key: motivo, value: motivo }, motivo.replace(/_/g, ' '))
                                        )
                                    )
                                ),
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 2'),
                                    React.createElement('select', {
                                        value: auditForm.motivo_2_erro || '',
                                        onChange: (e) => {
                                            const motivo2 = e.target.value;
                                            const detalhamentos = (MOTIVOS_SUBMOTIVOS[auditForm.motivo_1_sistema_documento] && MOTIVOS_SUBMOTIVOS[auditForm.motivo_1_sistema_documento][motivo2]) || [];
                                            setAuditForm(prev => ({ ...prev, motivo_2_erro: motivo2, motivo_3_detalhamento: detalhamentos.length === 1 ? detalhamentos[0] : '' }));
                                        },
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        disabled: !auditForm.motivo_1_sistema_documento
                                    },
                                        React.createElement('option', { value: '' }, 'Selecione o Motivo 1 primeiro...'),
                                        Object.keys(MOTIVOS_SUBMOTIVOS[auditForm.motivo_1_sistema_documento] || {}).map(sub =>
                                            React.createElement('option', { key: sub, value: sub }, sub.replace(/_/g, ' '))
                                        )
                                    )
                                ),
                                React.createElement('div', { className: "mb-3" },
                                    React.createElement('label', { className: "block text-sm font-medium text-slate-700 mb-1" }, 'Motivo 3 - Detalhamento'),
                                    React.createElement('select', {
                                        value: auditForm.motivo_3_detalhamento || '',
                                        onChange: (e) => setAuditForm({ ...auditForm, motivo_3_detalhamento: e.target.value }),
                                        className: "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200",
                                        disabled: !auditForm.motivo_2_erro || !(MOTIVOS_SUBMOTIVOS[auditForm.motivo_1_sistema_documento]?.[auditForm.motivo_2_erro] || []).length
                                    },
                                        React.createElement('option', { value: '' }, 'Selecione o detalhamento...'),
                                        (MOTIVOS_SUBMOTIVOS[auditForm.motivo_1_sistema_documento]?.[auditForm.motivo_2_erro] || []).map(det =>
                                            React.createElement('option', { key: det, value: det }, det.replace(/_/g, ' '))
                                        )
                                    )
                                ),

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
                                            React.createElement('option', { value: 'Reprova Indevida', className: "text-red-700" }, '❌ Reprova Indevida')
                                          )
                                    )
                                )
                            ),

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
                    )
                ),

                toast && React.createElement(Toast, { message: toast.message, type: toast.type, onClose: () => setToast(null) })
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
    