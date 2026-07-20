const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// A sintaxe está quebrada na linha 1217 - falta fechar a rota auditar original
// Precisamos reconstruir essa seção

const fix = `// API: Salvar auditoria de qualidade (insere ou atualiza na auditoria_qualidade)
app.post('/api/qualidade/auditar', authenticateToken, async (req, res) => {
  try {
    const { id_cotacao, anotacao, status } = req.body;

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

    // Verificar se já existe auditoria para esta cotação
    const cotacaoRow = await pool.query(
      'SELECT id_qldd FROM db_bloco_de_notas.cotacao WHERE id_cotacao = $1',
      [id_cotacao]
    );
    const idQldd = cotacaoRow.rows.length > 0 ? cotacaoRow.rows[0].id_qldd : null;

    if (idQldd) {
      await pool.query(
        'UPDATE db_bloco_de_notas.auditoria_qualidade SET anotacao = $1, status = $2 WHERE id_qldd = $3',
        [anotacao || '', status, idQldd]
      );
    } else {
      const insertAudit = await pool.query(
        'INSERT INTO db_bloco_de_notas.auditoria_qualidade (anotacao, status) VALUES ($1, $2) RETURNING id_qldd',
        [anotacao || '', status]
      );
      const newIdQldd = insertAudit.rows[0].id_qldd;
      await pool.query(
        'UPDATE db_bloco_de_notas.cotacao SET id_qldd = $1 WHERE id_cotacao = $2',
        [newIdQldd, id_cotacao]
      );
    }

    // Atualizar o status na tabela cotacao também
    await pool.query(
      "UPDATE db_bloco_de_notas.cotacao SET status = $1, data_da_ultima_atualizacao = $2 WHERE id_cotacao = $3 AND validacao = 'Ativo'",
      [status.toLowerCase(), formatDateBR(new Date()), id_cotacao]
    );

    res.json({
      success: true,
      message: 'Auditoria salva com sucesso',
      id_cotacao,
      anotacao: anotacao || '',
      status
    });
  } catch (error) {
    console.error('[QUALIDADE] Erro ao salvar auditoria:', error);
    res.status(500).json({ error: 'Erro ao salvar auditoria' });
  }
});

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

// Encontrar onde começa a seção corrompida (linha 1211)
const startMarker = '// API: Salvar auditoria de qualidade (insere ou atualiza na auditoria_qualidade)';
const startIndex = content.indexOf(startMarker);

if (startIndex !== -1) {
    // Encontrar o fim da seção corrompida (antes de "// API: Estatísticas de qualidade")
    const endMarker = '// API: Estatísticas de qualidade para o usuário logado';
    const endIndex = content.indexOf(endMarker, startIndex);
    
    if (endIndex !== -1) {
        // Substituir a seção corrompida
        content = content.slice(0, startIndex) + fix + content.slice(endIndex);
        fs.writeFileSync(serverPath, content, 'utf8');
        console.log('[FIX] Sintaxe do server.js corrigida com sucesso!');
        console.log(`- Seção de ${startIndex} até ${endIndex} foi reescrita`);
    } else {
        console.log('[FIX] Marcador de fim não encontrado');
    }
} else {
    console.log('[FIX] Marcador de início não encontrado');
}