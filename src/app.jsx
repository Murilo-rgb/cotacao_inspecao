const { useState, useEffect } = React;

// Icons as SVG components
const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
    </svg>
);

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        <path d="m15 5 4 4"></path>
    </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18"></path>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
    </svg>
);

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" x2="9" y1="12" y2="12"></line>
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14"></path>
        <path d="M12 5v14"></path>
    </svg>
);

const FileTextIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" x2="8" y1="13" y2="13"></line>
        <line x1="16" x2="8" y1="17" y2="17"></line>
        <line x1="10" x2="8" y1="9" y2="9"></line>
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
    </svg>
);

const AlertTriangleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
        <path d="M12 9v4"></path>
        <path d="M12 17h.01"></path>
    </svg>
);

// Toast component
function Toast({ message, type, onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 toast-enter ${
            type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            {type === 'success' ? <CheckIcon /> : <AlertTriangleIcon />}
            <span className="font-medium text-sm">{message}</span>
        </div>
    );
}

// Main App Component
function App() {
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [editingQuotation, setEditingQuotation] = useState(null);
    const [formData, setFormData] = useState({ cotacao: '', anotacao: '' });
    const [showModal, setShowModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState(null);
    const [statusModal, setStatusModal] = useState(null);
    const [username, setUsername] = useState('');
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = BASE_PATH + '/login.html';
            return;
        }
        const storedUsername = localStorage.getItem('username');
        if (storedUsername) {
            setUsername(storedUsername);
        }
        fetchQuotations();

        const handlePopState = (event) => {
            const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            const currentToken = localStorage.getItem('token');
            if (!currentToken) {
                window.location.href = BASE_PATH + '/login.html';
            } else {
                window.history.pushState(null, '', window.location.href);
            }
        };

        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
    };

    const fetchQuotations = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            
            const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            const response = await fetch(`${BASE_PATH}/api/quotations?${params}`, {
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
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchQuotations();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
        window.location.href = BASE_PATH + '/login.html';
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        
        try {
            if (editingQuotation) {
                    const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
                    const response = await fetch(`${BASE_PATH}/api/quotations/${editingQuotation.cotacao}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ 
                        anotacao: formData.anotacao,
                        status: editingQuotation.status
                    })
                });
                
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    window.location.href = BASE_PATH + '/login.html';
                    return;
                }
                
                if (response.ok) {
                    fetchQuotations();
                    setShowModal(false);
                    setEditingQuotation(null);
                    setFormData({ cotacao: '', anotacao: '' });
                    showToast('Cotação atualizada com sucesso');
                }
            } else {
                const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
                const response = await fetch(`${BASE_PATH}/api/quotations`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    window.location.href = BASE_PATH + '/login.html';
                    return;
                }
                
                if (response.ok) {
                    fetchQuotations();
                    setShowModal(false);
                    setFormData({ cotacao: '', anotacao: '' });
                    showToast('Cotação criada com sucesso');
                }
            }
        } catch (error) {
            console.error('Erro ao salvar cotação:', error);
            showToast('Erro ao salvar cotação', 'error');
        }
    };

    const handleEditClick = (quotation) => {
        setEditingQuotation(quotation);
        setFormData({ cotacao: quotation.cotacao, anotacao: quotation.anotacao });
        setShowModal(true);
    };

    const handleDeleteClick = (quotation) => {
        setDeleteModal(quotation);
    };

    const confirmDelete = async () => {
        if (!deleteModal) return;
        
        const token = localStorage.getItem('token');
        try {
            const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            const response = await fetch(`${BASE_PATH}/api/quotations/${deleteModal.cotacao}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                window.location.href = BASE_PATH + '/login.html';
                return;
            }
            
            if (response.ok) {
                fetchQuotations();
                setDeleteModal(null);
                showToast('Cotação excluída com sucesso');
            }
        } catch (error) {
            console.error('Erro ao deletar cotação:', error);
            showToast('Erro ao excluir cotação', 'error');
        }
    };

    const cancelDelete = () => {
        setDeleteModal(null);
    };

    const handleStatusClick = (quotation) => {
        setStatusModal(quotation);
    };

    const handleStatusChange = async (newStatus) => {
        if (!statusModal) return;
        
        const token = localStorage.getItem('token');
        try {
            const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
            const response = await fetch(`${BASE_PATH}/api/quotations/${statusModal.cotacao}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                const BASE_PATH = window.location.pathname.startsWith('/pme_notas') ? '/pme_notas' : '';
                window.location.href = BASE_PATH + '/login.html';
                return;
            }
            
            if (response.ok) {
                fetchQuotations();
                setStatusModal(null);
                showToast('Status atualizado com sucesso');
            }
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            showToast('Erro ao atualizar status', 'error');
        }
    };

    const filteredQuotations = quotations.filter(q =>
        q.cotacao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.anotacao && q.anotacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (q.status && q.status.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentQuotations = filteredQuotations.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);

    const getStatusConfig = (status) => {
        switch (status) {
            case 'aprovado':
                return {
                    label: 'Aprovado',
                    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
                    dotClass: 'bg-emerald-500'
                };
            case 'reprovado':
                return {
                    label: 'Reprovado',
                    className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
                    dotClass: 'bg-red-500'
                };
            default:
                return {
                    label: 'Pendente',
                    className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                    dotClass: 'bg-amber-500'
                };
        }
    };

    const formatDate = (dateString) => {
        if (!dateString || dateString === '-') return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateString;
        }
    };

    const SkeletonRow = () => (
        <tr className="animate-pulse">
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-full max-w-xs"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-28"></div></td>
            <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-28"></div></td>
            <td className="px-6 py-4"><div className="h-6 bg-slate-200 rounded-full w-20"></div></td>
            <td className="px-6 py-4"><div className="flex gap-2"><div className="h-8 w-8 bg-slate-200 rounded-lg"></div><div className="h-8 w-8 bg-slate-200 rounded-lg"></div></div></td>
        </tr>
    );

    return (
        <div className="min-h-screen bg-slate-50/80">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800">Cotações</h1>
                                <p className="text-xs text-slate-500">Gerenciamento de cotações</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full shadow-sm">
                                <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-sm">
                                    <UserIcon />
                                </div>
                                <span className="text-sm font-semibold text-white">{username}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                            >
                                <LogoutIcon />
                                <span className="hidden sm:inline">Sair</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Total</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{filteredQuotations.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-sm font-medium text-emerald-600">Aprovadas</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">
                            {filteredQuotations.filter(q => q.status === 'aprovado').length}
                        </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-sm font-medium text-amber-600">Pendentes</p>
                        <p className="text-2xl font-bold text-amber-700 mt-1">
                            {filteredQuotations.filter(q => !q.status || q.status === 'pendente').length}
                        </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-sm font-medium text-red-600">Reprovadas</p>
                        <p className="text-2xl font-bold text-red-700 mt-1">
                            {filteredQuotations.filter(q => q.status === 'reprovado').length}
                        </p>
                    </div>
                </div>

                {/* Search and Add */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1 relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <SearchIcon />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por cotação, anotação ou status..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-lg shadow-sm transition-all duration-200 group-hover:border-slate-300"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <div className="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-red-500 transition-colors duration-200"></div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setEditingQuotation(null);
                            setFormData({ cotacao: '', anotacao: '' });
                            setShowModal(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                        <PlusIcon />
                        Nova cotação
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cotação</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Anotação</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Criação</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Atualização</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
                                </tbody>
                            </table>
                        </div>
                    ) : filteredQuotations.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl text-slate-400 mb-4">
                                <FileTextIcon />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-1">Nenhuma cotação encontrada</h3>
                            <p className="text-slate-500 text-sm">Tente ajustar sua busca ou adicione uma nova cotação.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cotação</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Anotação</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Criação</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Atualização</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {currentQuotations.map((quotation) => {
                                        const statusConfig = getStatusConfig(quotation.status);
                                        return (
                                            <tr key={quotation.cotacao} className="hover:bg-slate-50/80 transition-colors duration-150">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-semibold text-slate-900 font-mono bg-slate-100 px-2 py-1 rounded-md">
                                                        {(quotation.dsc_cotacao ? `${quotation.dsc_cotacao} - ` : '') + quotation.cotacao}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-slate-600 max-w-md truncate" title={quotation.anotacao}>
                                                        {quotation.anotacao || '-'}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(quotation.createdAt)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(quotation.updatedAt)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleStatusClick(quotation)}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 hover:shadow-sm ${statusConfig.className}`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`}></span>
                                                        {statusConfig.label}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleEditClick(quotation)}
                                                            className="group p-2 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md"
                                                            title="Editar"
                                                        >
                                                            <EditIcon />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(quotation)}
                                                            className="group p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md"
                                                            title="Excluir"
                                                        >
                                                            <TrashIcon />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-sm text-slate-500 hidden sm:block">
                            Mostrando <span className="font-medium">{indexOfFirstItem + 1}</span> a <span className="font-medium">{Math.min(indexOfLastItem, filteredQuotations.length)}</span> de <span className="font-medium">{filteredQuotations.length}</span> resultados
                        </p>
                        <div className="flex items-center gap-2 mx-auto sm:mx-0">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            >
                                Anterior
                            </button>
                            <div className="flex items-center gap-1">
                                {[...Array(totalPages)].map((_, i) => {
                                    const page = i + 1;
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors duration-200 ${
                                                currentPage === page
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal */}
            {showModal && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowModal(false);
                            setEditingQuotation(null);
                            setFormData({ cotacao: '', anotacao: '' });
                        }
                    }}
                >
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl modal-content">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editingQuotation ? 'Editar cotação' : 'Nova cotação'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setEditingQuotation(null);
                                    setFormData({ cotacao: '', anotacao: '' });
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                            >
                                <XIcon />
                            </button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Cotação</label>
                                <input
                                    type="text"
                                    value={formData.cotacao}
                                    onChange={(e) => setFormData({...formData, cotacao: e.target.value})}
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-500"
                                    required
                                    disabled={!!editingQuotation}
                                    placeholder="Digite o número da cotação"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Anotação</label>
                                <textarea
                                    value={formData.anotacao}
                                    onChange={(e) => setFormData({...formData, anotacao: e.target.value})}
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 resize-none"
                                    rows="3"
                                    placeholder="Adicione uma observação..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Data Criação</label>
                                    <input
                                        type="text"
                                        value={editingQuotation ? formatDate(editingQuotation.createdAt) : formatDate(new Date().toISOString())}
                                        disabled
                                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Data Atualização</label>
                                    <input
                                        type="text"
                                        value={editingQuotation ? formatDate(editingQuotation.updatedAt) : formatDate(new Date().toISOString())}
                                        disabled
                                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                                <input
                                    type="text"
                                    value={editingQuotation ? (editingQuotation.status || 'pendente') : 'pendente'}
                                    disabled
                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-500 capitalize"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200"
                                >
                                    Salvar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowModal(false);
                                        setEditingQuotation(null);
                                        setFormData({ cotacao: '', anotacao: '' });
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 focus:ring-4 focus:ring-slate-500/10 transition-all duration-200"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {deleteModal && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setDeleteModal(null);
                    }}
                >
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl modal-content">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <AlertTriangleIcon />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800">Confirmar Exclusão</h2>
                        </div>
                        <p className="text-slate-600 text-sm mb-6">
                            Tem certeza que deseja excluir a cotação <span className="font-semibold text-slate-800 font-mono">{deleteModal.cotacao}</span>? Esta ação não poderá ser desfeita.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 focus:ring-4 focus:ring-red-500/20 transition-all duration-200"
                            >
                                Excluir
                            </button>
                            <button
                                onClick={cancelDelete}
                                className="flex-1 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 focus:ring-4 focus:ring-slate-500/10 transition-all duration-200"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Modal */}
            {statusModal && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 modal-overlay p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setStatusModal(null);
                    }}
                >
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl modal-content">
                        <h2 className="text-lg font-bold text-slate-800 mb-2">Alterar Status</h2>
                        <p className="text-sm text-slate-500 mb-5">
                            Selecione o novo status para a cotação <span className="font-semibold text-slate-800 font-mono">{statusModal.cotacao}</span>.
                        </p>
                        <div className="space-y-2.5">
                            <button
                                onClick={() => handleStatusChange('pendente')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all duration-200 font-semibold text-sm"
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                Pendente
                            </button>
                            <button
                                onClick={() => handleStatusChange('aprovado')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all duration-200 font-semibold text-sm"
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                Aprovado
                            </button>
                            <button
                                onClick={() => handleStatusChange('reprovado')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 transition-all duration-200 font-semibold text-sm"
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                Reprovado
                            </button>
                        </div>
                        <button
                            onClick={() => setStatusModal(null)}
                            className="w-full mt-4 px-4 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 text-sm font-semibold transition-all duration-200"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}

// Render
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
