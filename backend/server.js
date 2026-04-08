const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'dmelo_master_key_2024';

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '..', 'public')));

// CONEXÃO COM SUPABASE
const pool = new Pool({
    connectionString: 'postgresql://postgres:%40DMELO%402024@db.tziekmcnjiluwkxqxlpe.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

// Criar tabelas automaticamente
async function initDatabase() {
    try {
        // Tabela de produtos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS produtos (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT,
                preco TEXT NOT NULL,
                imagem TEXT,
                destaque INTEGER DEFAULT 0
            )
        `);

        // Tabela de avaliações
        await pool.query(`
            CREATE TABLE IF NOT EXISTS avaliacoes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                rating INTEGER NOT NULL,
                texto TEXT NOT NULL,
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de pedidos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                cliente_nome TEXT NOT NULL,
                cliente_telefone TEXT NOT NULL,
                pedido TEXT NOT NULL,
                status TEXT DEFAULT 'pendente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela admin
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            )
        `);

        // Inserir produtos iniciais
        const produtosCheck = await pool.query("SELECT COUNT(*) FROM produtos");
        if (parseInt(produtosCheck.rows[0].count) === 0) {
            const produtos = [
                ['Bolo de Chocolate', 'Massa fofinha com cobertura de brigadeiro', 'R$ 45,00', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300', 1],
                ['Torta de Limão', 'Mousse de limão siciliano com merengue', 'R$ 35,00', 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=300', 1],
                ['Bolo de Cenoura', 'Com cobertura de chocolate meio amargo', 'R$ 40,00', 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=300', 1],
                ['Bolo de Morango', 'Recheio de morango fresco com chantilly', 'R$ 50,00', 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=300', 0]
            ];
            for (const p of produtos) {
                await pool.query("INSERT INTO produtos (nome, descricao, preco, imagem, destaque) VALUES ($1, $2, $3, $4, $5)", p);
            }
            console.log('✅ Produtos inseridos');
        }

        // Inserir avaliações iniciais
        const reviewsCheck = await pool.query("SELECT COUNT(*) FROM avaliacoes");
        if (parseInt(reviewsCheck.rows[0].count) === 0) {
            const avaliacoes = [
                ['Maria Silva', 5, 'Melhor bolo que já comi! Muito fofo e saboroso.'],
                ['João Pereira', 5, 'Atendimento excelente e produtos de qualidade.'],
                ['Ana Costa', 4, 'Torta de limão maravilhosa, voltarei mais vezes!']
            ];
            for (const a of avaliacoes) {
                await pool.query("INSERT INTO avaliacoes (nome, rating, texto) VALUES ($1, $2, $3)", a);
            }
            console.log('✅ Avaliações inseridas');
        }

        // Criar admin
        const adminCheck = await pool.query("SELECT COUNT(*) FROM admin WHERE username = 'admin'");
        if (parseInt(adminCheck.rows[0].count) === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await pool.query("INSERT INTO admin (username, password) VALUES ($1, $2)", ['admin', hashedPassword]);
            console.log('✅ Usuário admin: admin / admin123');
        }

        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (err) {
        console.error('Erro ao inicializar banco:', err);
    }
}

initDatabase();

// ============= ROTAS =============

app.get('/api/menu', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM produtos ORDER BY destaque DESC, id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reviews', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM avaliacoes ORDER BY data DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/pedidos', async (req, res) => {
    const { cliente_nome, cliente_telefone, pedido } = req.body;
    if (!cliente_nome || !cliente_telefone || !pedido) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    try {
        const result = await pool.query(
            "INSERT INTO pedidos (cliente_nome, cliente_telefone, pedido) VALUES ($1, $2, $3) RETURNING id",
            [cliente_nome, cliente_telefone, pedido]
        );
        res.json({ id: result.rows[0].id, message: 'Pedido enviado!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM admin WHERE username = $1", [username]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Token não fornecido' });
    jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = decoded;
        next();
    });
}

app.get('/api/admin/produtos', verifyToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM produtos ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/produtos', verifyToken, async (req, res) => {
    const { nome, descricao, preco, imagem, destaque } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO produtos (nome, descricao, preco, imagem, destaque) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [nome, descricao, preco, imagem, destaque || 0]
        );
        res.json({ id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/produtos/:id', verifyToken, async (req, res) => {
    const { nome, descricao, preco, imagem, destaque } = req.body;
    try {
        await pool.query(
            "UPDATE produtos SET nome=$1, descricao=$2, preco=$3, imagem=$4, destaque=$5 WHERE id=$6",
            [nome, descricao, preco, imagem, destaque || 0, req.params.id]
        );
        res.json({ message: 'Produto atualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/produtos/:id', verifyToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM produtos WHERE id=$1", [req.params.id]);
        res.json({ message: 'Produto removido' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/pedidos', verifyToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM pedidos ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/pedidos/:id/status', verifyToken, async (req, res) => {
    try {
        await pool.query("UPDATE pedidos SET status=$1 WHERE id=$2", [req.body.status, req.params.id]);
        res.json({ message: 'Status atualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const produtos = await pool.query("SELECT COUNT(*) as total FROM produtos");
        const pedidos = await pool.query("SELECT COUNT(*) as total FROM pedidos WHERE status='pendente'");
        const avaliacoes = await pool.query("SELECT AVG(rating) as media FROM avaliacoes");
        res.json({
            totalProdutos: parseInt(produtos.rows[0].total),
            pedidosPendentes: parseInt(pedidos.rows[0].total),
            mediaAvaliacoes: avaliacoes.rows[0].media ? parseFloat(avaliacoes.rows[0].media).toFixed(1) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🎉 Servidor D'Melo rodando na porta ${PORT}`);
});