const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// 1. Add calcularSemana function after formatDateBR
const calculoSemanaCode = `
// Função para calcular a semana do ano (1-53)
function calcularSemana(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + 1) / 7);
    return week;
}
`;

if (!content.includes('function calcularSemana')) {
    content = content.replace(
        '// PostgreSQL connection',
        calculoSemanaCode + '\n// PostgreSQL connection'
    );
    console.log('[PATCH] Added calcularSemana function');
}

// 2. Add relatorio route before stats route
const relatorioRoute = `
// API: Relatório de qualidade no formato dev_parcial_indev
app.get('/api/qualidade/relatorio', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(\`
            SELECT 
                aq.semana,
                aq.data_qualidade,
                TRIM(COALESCE(uq.nome, '') || ' ' || COALESCE(uq.sobrenome, '')) as analista_qualidade,
                aq.reprova_bko,
                aq.fila,
                aq.codigo_tarefa,
                TRIM(COALESCE(ua.nome, '') || ' ' || COALESCE(ua.sobrenome, '')) as analista,
                aq.data_analise,
                aq.cotacao,
                aq.regional,
                aq.tipo_de_pedido,
                aq.motivo_1_sistema_documento,
                aq.motivo_2_erro,
                aq.motivo_3_detalhamento,
                aq.apontamento,
                aq.contestacao,
                aq.obs,
                aq.enviado,
                aq.data_envio as "data"
            FROM db_bloco_de_notas.auditoria_qualidade aq
            LEFT JOIN db_automacao.usuarios uq ON uq.id = aq.analista_qualidade_id
            LEFT JOIN db_bloco_de_notas.cotacao c ON c.id_qldd = aq.id_qldd
            LEFT JOIN db_automacao.usuarios ua ON ua.id::TEXT = c.usuario_id::TEXT
            ORDER BY aq.data_qualidade DESC NULLS LAST
        \`);
        res.json(result.rows);
    } catch (error) {
        console.error('[QUALIDADE] Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

`;

if (!content.includes('/api/qualidade/relatorio')) {
    content = content.replace(
        '// API: Estatísticas de qualidade para o usuário logado',
        relatorioRoute + '// API: Estatísticas de qualidade para o usuário logado'
    );
    console.log('[PATCH] Added relatorio route');
}

// 3. Add auditar-completo route before stats route (after the original auditar route)
const auditarCompletoRoute = `
// API: Salvar auditoria de qualidade completa (todos os campos)
app.post('/api/qualidade/auditar-completo', authenticateToken, async (req, res) => {
    try {
        const { id_cotacao, reprova_bko, apontamento, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, contestacao, obs, regional, tipo_de_pedido, enviado, data_envio, status } = req.body;
        const usuarioLogadoId = req.user.id;

        if (!id_cotacao) {
            return res.status(400).json({ error: 'ID da cotação é obrigatório' });
        }
        if (!status) {
            return res.status(400).json({ error: 'Status é obrigatório' });
        }
        const statusPermitidos = ['Procedimento Correto', 'Devolução Parcial', 'Devolução Indevida', 'Reprova Parcial', 'Reprova Indevida', 'Aprovacao Indevida'];
        if (!statusPermitidos.includes(status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const cotacaoRow = await pool.query(
            'SELECT tarefa, cotacao, usuario_id, data_de_criacao FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
            [id_cotacao]
        );
        if (cotacaoRow.rows.length === 0) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        const cotacao = cotacaoRow.rows[0];
        const analistaRes = await pool.query(
            'SELECT TRIM(COALESCE(nome, '''') || '' '' || COALESCE(sobrenome, '''')) as nome FROM db_automacao.usuarios WHERE id::TEXT = $1',
            [cotacao.usuario_id]
        );
        const analistaNome = analistaRes.rows.length > 0 ? analistaRes.rows[0].nome : null;

        const now = new Date();
        const dataQualidade = formatDateBR(now);
        const semana = calcularSemana(now);
        const anotacao = [reprova_bko, apontamento].filter(Boolean).join('\\n');

        const existingAudit = await pool.query(
            'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
            [id_cotacao]
        );
        const idQldd = existingAudit.rows.length > 0 ? existingAudit.rows[0].id_qldd : null;

        if (idQldd) {
            await pool.query(
                \`UPDATE db_bloco_de_notas.auditoria_qualidade SET
                    anotacao = $1, status = $2, data_qualidade = $3, analista_qualidade_id = $4,
                    reprova_bko = $5, codigo_tarefa = $6, analista = $7, data_analise = $8,
                    cotacao = $9, regional = $10, tipo_de_pedido = $11,
                    motivo_1_sistema_documento = $12, motivo_2_erro = $13, motivo_3_detalhamento = $14,
                    apontamento = $15, contestacao = $16, obs = $17, enviado = $18, data_envio = $19, semana = $20
                WHERE id_qldd = $21\`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 cotacao.data_de_criacao, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana, idQldd]
            );
        } else {
            const insertAudit = await pool.query(
                \`INSERT INTO db_bloco_de_notas.auditoria_qualidade
                    (anotacao, status, data_qualidade, analista_qualidade_id, reprova_bko, codigo_tarefa, analista, data_analise, cotacao, regional, tipo_de_pedido, motivo_1_sistema_documento, motivo_2_erro, motivo_3_detalhamento, apontamento, contestacao, obs, enviado, data_envio, semana)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id_qldd\`,
                [anotacao, status, now, usuarioLogadoId, reprova_bko || '', cotacao.tarefa, analistaNome,
                 cotacao.data_de_criacao, cotacao.cotacao, regional || '', tipo_de_pedido || '',
                 motivo_1_sistema_documento || '', motivo_2_erro || '', motivo_3_detalhamento || '',
                 apontamento || '', contestacao || '', obs || '', enviado || false,
                 data_envio ? new Date(data_envio) : null, semana]
            );
            const newIdQldd = insertAudit.rows[0].id_qldd;
            await pool.query(
                'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
                [newIdQldd, id_cotacao]
            );
        }

        await pool.query(
            "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
            [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
        );

        res.json({
            success: true,
            message: 'Auditoria salva com sucesso',
            id_cotacao,
            data_qualidade: dataQualidade,
            semana,
            status
        });
    } catch (error) {
        console.error('[QUALIDADE] Erro ao salvar auditoria:', error);
        res.status(500).json({ error: 'Erro ao salvar auditoria' });
    }
});

`;

if (!content.includes('/api/qualidade/auditar-completo')) {
    // Find the end of the original auditar route and insert after it
    const auditarRouteEnd = content.match(/app\.post\('\/api\/qualidade\/auditar'[^}]+\}[^}]+\}/);
    if (auditarRouteEnd) {
        const insertPoint = content.indexOf(auditarRouteEnd[0]) + auditarRouteEnd[0].length;
        content = content.slice(0, insertPoint) + auditarCompletoRoute + content.slice(insertPoint);
        console.log('[PATCH] Added auditar-completo route');
    }
}

// Write back
fs.writeFileSync(serverPath, content, 'utf8');
console.log('[PATCH] Server patched successfully!');
console.log('Added: calcularSemana, /api/qualidade/relatorio, /api/qualidade/auditar-completo');