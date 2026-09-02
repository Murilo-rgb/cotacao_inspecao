// ============================================================
// MENU DE NAVEGAÇÃO GLOBAL - Sistema PME Notas
// Botão hambúrguer flutuante com dropdown de navegação
// ============================================================
(function() {
    // Evitar duplicação se o script for carregado mais de uma vez
    if (window.__menuNavegacaoInjetado) return;
    window.__menuNavegacaoInjetado = true;

    // Detectar caminho base (com ou sem prefixo /pme_notas)
    function getBasePath() {
        const path = window.location.pathname;
        if (path.startsWith('/pme_notas')) {
            return '/pme_notas';
        }
        return '';
    }

    const base = getBasePath();

    // Itens do menu
    const itensMenu = [
        {
            nome: 'Cotações',
            href: base + '/cotacoes',
            cor: 'from-blue-500 to-blue-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>'
        },
        {
            nome: 'Inspeção',
            href: base + '/inspecao',
            cor: 'from-violet-500 to-purple-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>'
        },
        {
            nome: 'Input Net',
            href: base + '/input_net',
            cor: 'from-emerald-500 to-teal-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>'
        },
        {
            nome: 'Input Top',
            href: base + '/input_top',
            cor: 'from-amber-500 to-orange-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>'
        },
        {
            nome: 'HH',
            href: base + '/hh',
            cor: 'from-rose-500 to-pink-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2H5M9 7h6M9 11h6M9 15h4"/></svg>'
        },
        {
            nome: 'Qualidade',
            href: base + '/qualidade',
            cor: 'from-indigo-500 to-blue-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>'
        },
        {
            nome: 'Cortesia',
            href: base + '/cortesia',
            cor: 'from-fuchsia-500 to-purple-600',
            icone: '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.5v8.25a1.5 1.5 0 01-1.5 1.5H15a1.5 1.5 0 01-1.5-1.5v-8.25m3 0V3.75a1.5 1.5 0 00-3 0M21 11.5h-1.5M21 11.5v-1.5a1.5 1.5 0 00-1.5-1.5H15a1.5 1.5 0 00-1.5 1.5v1.5M3 11.5v8.25A1.5 1.5 0 004.5 21.25H9a1.5 1.5 0 001.5-1.5v-8.25m0 0V3.75a1.5 1.5 0 00-3 0m3 7.75H3m12 0h-7.5"/></svg>'
        },
    ];

    // Criar estilos
    const style = document.createElement('style');
    style.textContent = `
        #menuNavGlobal {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 9999;
            font-family: 'Inter', sans-serif;
        }
        #menuNavGlobal .menu-btn {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, #7c3aed, #6d28d9);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 10px 25px -5px rgba(109, 40, 217, 0.5), 0 8px 10px -6px rgba(109, 40, 217, 0.3);
            transition: all 0.3s ease;
            position: relative;
            z-index: 10001;
        }
        #menuNavGlobal .menu-btn:hover {
            transform: scale(1.08);
            box-shadow: 0 15px 30px -5px rgba(109, 40, 217, 0.6), 0 10px 15px -6px rgba(109, 40, 217, 0.4);
        }
        #menuNavGlobal .menu-btn:active {
            transform: scale(0.95);
        }
        #menuNavGlobal .menu-btn svg {
            width: 26px;
            height: 26px;
            transition: transform 0.3s ease;
        }
        #menuNavGlobal .menu-btn.open svg {
            transform: rotate(90deg);
        }
        #menuNavGlobal .menu-panel {
            position: absolute;
            bottom: 68px;
            right: 0;
            width: 260px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.15);
            border: 1px solid #e2e8f0;
            padding: 8px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px) scale(0.98);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            transform-origin: bottom right;
            z-index: 10000;
        }
        #menuNavGlobal .menu-panel.open {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }
        #menuNavGlobal .menu-title {
            padding: 10px 12px 8px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
            border-bottom: 1px solid #f1f5f9;
            margin-bottom: 6px;
        }
        #menuNavGlobal .menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            text-decoration: none;
            color: #334155;
            transition: all 0.15s ease;
            cursor: pointer;
        }
        #menuNavGlobal .menu-item:hover {
            background: #f1f5f9;
            color: #1e293b;
        }
        #menuNavGlobal .menu-item.active {
            background: #eef2ff;
            color: #6d28d9;
        }
        #menuNavGlobal .menu-item-icon {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            flex-shrink: 0;
        }
        #menuNavGlobal .menu-item-name {
            font-size: 14px;
            font-weight: 600;
        }
        #menuNavGlobal .menu-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: transparent;
            display: none;
        }
        #menuNavGlobal .menu-overlay.show {
            display: block;
        }

        /* Dark mode */
        html.dark #menuNavGlobal .menu-panel {
            background: #1e293b;
            border-color: #334155;
        }
        html.dark #menuNavGlobal .menu-title {
            color: #64748b;
            border-bottom-color: #334155;
        }
        html.dark #menuNavGlobal .menu-item {
            color: #e2e8f0;
        }
        html.dark #menuNavGlobal .menu-item:hover {
            background: #334155;
            color: #f1f5f9;
        }
        html.dark #menuNavGlobal .menu-item.active {
            background: rgba(109, 40, 217, 0.2);
            color: #a78bfa;
        }

        /* Responsivo */
        @media (max-width: 640px) {
            #menuNavGlobal {
                bottom: 16px;
                right: 16px;
            }
            #menuNavGlobal .menu-btn {
                width: 50px;
                height: 50px;
                border-radius: 14px;
            }
            #menuNavGlobal .menu-panel {
                width: 240px;
            }
        }
    `;
    document.head.appendChild(style);

    // Criar estrutura do menu
    const container = document.createElement('div');
    container.id = 'menuNavGlobal';

    // Overlay para fechar ao clicar fora
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    overlay.id = 'menuNavOverlay';

    // Botão hambúrguer
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.id = 'menuNavBtn';
    btn.setAttribute('aria-label', 'Menu de navegação');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>';

    // Painel do menu
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.id = 'menuNavPanel';

    // Título
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'Navegação';
    panel.appendChild(title);

    // Itens
    const pathAtual = window.location.pathname;
    itensMenu.forEach(item => {
        const link = document.createElement('a');
        link.className = 'menu-item';
        link.href = item.href;

        // Marcar item ativo se estiver na página atual
        if (pathAtual === item.href || pathAtual === item.href + '/' || pathAtual.startsWith(item.href + '/')) {
            link.classList.add('active');
        }

        const iconDiv = document.createElement('div');
        iconDiv.className = 'menu-item-icon bg-gradient-to-br ' + item.cor;
        iconDiv.innerHTML = item.icone;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'menu-item-name';
        nameSpan.textContent = item.nome;

        link.appendChild(iconDiv);
        link.appendChild(nameSpan);
        panel.appendChild(link);
    });

    container.appendChild(overlay);
    container.appendChild(panel);
    container.appendChild(btn);
    document.body.appendChild(container);

    // Lógica de abrir/fechar
    const btnEl = document.getElementById('menuNavBtn');
    const panelEl = document.getElementById('menuNavPanel');
    const overlayEl = document.getElementById('menuNavOverlay');

    function toggleMenu(open) {
        const isOpen = open !== undefined ? open : !panelEl.classList.contains('open');
        if (isOpen) {
            panelEl.classList.add('open');
            btnEl.classList.add('open');
            overlayEl.classList.add('show');
        } else {
            panelEl.classList.remove('open');
            btnEl.classList.remove('open');
            overlayEl.classList.remove('show');
        }
    }

    btnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    overlayEl.addEventListener('click', () => toggleMenu(false));

    // Fechar com tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleMenu(false);
    });

    // Fechar ao clicar em um item (navegação)
    panelEl.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => toggleMenu(false));
    });
})();