function createPermissions(pool) {
    async function verificarPermissaoUsuario(usuarioId, rota) {
        try {
            const query = `
                SELECT tem_acesso 
                FROM db_automacao.usuario_permissoes 
                WHERE usuario_id = $1 AND rota = $2
            `;
            const result = await pool.query(query, [usuarioId, rota]);
            if (result.rows.length === 0) {
                const adminQuery = `
                    SELECT login FROM db_automacao.usuarios 
                    WHERE id = $1 AND (login = 'admin' OR login = 'jose.faria')
                `;
                const adminResult = await pool.query(adminQuery, [usuarioId]);
                return adminResult.rows.length > 0;
            }
            return result.rows[0].tem_acesso;
        } catch (error) {
            console.error('[PERMISSIONS] Erro ao verificar permissão:', error.message);
            return false;
        }
    }

    async function atualizarPermissao(usuarioId, rota, temAcesso, alteradoPor) {
        try {
            const query = `
                INSERT INTO db_automacao.usuario_permissoes (usuario_id, rota, tem_acesso, criado_por, atualizado_por, atualizado_em)
                VALUES ($1, $2, $3, $4, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (usuario_id, rota) 
                DO UPDATE SET 
                    tem_acesso = EXCLUDED.tem_acesso,
                    atualizado_por = EXCLUDED.atualizado_por,
                    atualizado_em = EXCLUDED.atualizado_em
                RETURNING *
            `;
            const result = await pool.query(query, [usuarioId, rota, temAcesso, alteradoPor]);
            return { success: true, permissao: result.rows[0] };
        } catch (error) {
            console.error('[PERMISSIONS] Erro ao atualizar permissão:', error.message);
            return { success: false, error: error.message };
        }
    }

    async function listarPermissoesUsuario(usuarioId) {
        try {
            const query = `
                SELECT rota, tem_acesso, atualizado_em, atualizado_por
                FROM db_automacao.usuario_permissoes 
                WHERE usuario_id = $1
                ORDER BY rota
            `;
            const result = await pool.query(query, [usuarioId]);
            return result.rows;
        } catch (error) {
            console.error('[PERMISSIONS] Erro ao listar permissões do usuário:', error.message);
            return [];
        }
    }

    async function listarUsuariosPorRota(rota) {
        try {
            const query = `
                SELECT u.id, u.login, u.nome, up.tem_acesso
                FROM db_automacao.usuarios u
                LEFT JOIN db_automacao.usuario_permissoes up ON u.id = up.usuario_id AND up.rota = $1
                WHERE u.ativo = true
                ORDER BY u.nome
            `;
            const result = await pool.query(query, [rota]);
            return result.rows;
        } catch (error) {
            console.error('[PERMISSIONS] Erro ao listar usuários por rota:', error.message);
            return [];
        }
    }

    function listarRotasSistema() {
        return [
            '/brain',
            '/api/logs_hoje',
            '/api/logs_acesso',
            '/api/logs_stats',
            '/api/log',
            '/api/permissions/usuarios',
            '/api/permissions/verificar',
            '/api/permissions/usuario',
            '/api/permissions/rota',
            '/api/permissions/rotas',
            '/api/permissions/atualizar',
            '/api/permissions/atualizar-multiple',
            '/api/permissions/resumo',
            '/api/auth/login',
            '/api/auth/logout',
            '/api/auth/verify',
            '/api/auth/trocar-senha',
            '/api/2fa',
            '/api/2fa/status'
        ];
    }

    async function criarTabelaPermissoes() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS db_automacao.usuario_permissoes (
                    id SERIAL PRIMARY KEY,
                    usuario_id INTEGER NOT NULL,
                    rota VARCHAR(200) NOT NULL,
                    tem_acesso BOOLEAN DEFAULT true,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    criado_por VARCHAR(50),
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    atualizado_por VARCHAR(50),
                    alterado_por VARCHAR(50),
                    UNIQUE (usuario_id, rota),
                    FOREIGN KEY (usuario_id) REFERENCES db_automacao.usuarios(id) ON DELETE CASCADE
                )
            `;
            await pool.query(query);
            console.log('[PERMISSIONS] Tabela de permissões verificada/criada com sucesso');
            return true;
        } catch (error) {
            console.error('[PERMISSIONS] Erro ao criar tabela de permissões:', error.message);
            return false;
        }
    }

    function authorizeRoute(rota) {
        return async (req, res, next) => {
            try {
                const temAcesso = await verificarPermissaoUsuario(req.user.id, rota);
                if (!temAcesso) {
                    return res.status(403).json({ error: 'Acesso negado. Sem permissão para esta rota.' });
                }
                next();
            } catch (error) {
                console.error('[AUTH] Erro ao verificar permissão:', error);
                res.status(500).json({ error: 'Erro ao verificar permissão' });
            }
        };
    }

    return {
        verificarPermissaoUsuario,
        atualizarPermissao,
        listarPermissoesUsuario,
        listarUsuariosPorRota,
        listarRotasSistema,
        criarTabelaPermissoes,
        authorizeRoute
    };
}

module.exports = { createPermissions };
