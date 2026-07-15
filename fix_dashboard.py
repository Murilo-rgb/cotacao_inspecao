import sys
sys.stdout.reconfigure(encoding='utf-8')

p = 'routes/inspecao.js'
s = open(p, encoding='utf-8').read()

# Encontrar a query do dashboard
marker = "router.get('/api/inspecao/dashboard'"
pos = s.find(marker)
if pos == -1:
    print("MARKER NOT FOUND")
    sys.exit(1)

# Encontrar o final da query (até o ; após ORDER BY)
query_start = s.find("const query = `", pos)
query_end = s.find("`;\n\n      const result = await pool.query(query,", query_start)
print("query_start", query_start, "query_end", query_end)
print("CURRENT QUERY:")
print(s[query_start:query_end+3])

new_query = """      const query = `
        SELECT
          l.login AS usuario_login,
          l.nome AS usuario_nome,
          COUNT(distinct c.tarefa) FILTER (WHERE c.status = 'pendente' OR c.status IS NULL) AS pendentes,
          COUNT(distinct c.tarefa) FILTER (WHERE c.status IS NOT NULL AND c.status != 'pendente') AS tratados,
          COUNT(distinct c.tarefa) AS total
        FROM db_gp.listafuncionarios l
        RIGHT JOIN db_automacao.usuarios u ON u.login = l.login
        left join db_bloco_de_notas.cotacao c
        on c.usuario_id::text = u.id::text
        AND c.validacao = 'Ativo'
        and l.ativo = true
        and to_date(c.data_de_criacao,'dd/MM/yyy') = current_date
        WHERE l.ilha ILIKE '%ins%' AND l.ativo = true
        GROUP BY l.login, l.nome
        ORDER BY l.nome
      `;"""

s2 = s[:query_start] + new_query + s[query_end+3:]
open(p, 'w', encoding='utf-8').write(s2)
print("UPDATED")