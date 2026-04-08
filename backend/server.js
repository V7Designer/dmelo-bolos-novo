const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'dmelo_master_key_2024';

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============= BANCO DE DADOS =============
const dbPath = path.join(__dirname, '..', 'database', 'dmelo.db');
const db = new sqlite3.Database(dbPath);

// Criar tabelas
db.serialize(() => {
  // Tabela de produtos
  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco TEXT NOT NULL,
    imagem TEXT,
    destaque INTEGER DEFAULT 0
  )`);

  // Tabela de avaliações
  db.run(`CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    rating INTEGER NOT NULL,
    texto TEXT NOT NULL,
    data DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de pedidos
  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    pedido TEXT NOT NULL,
    status TEXT DEFAULT 'pendente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela admin
  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )`);

  // Inserir dados iniciais
  db.get("SELECT COUNT(*) as count FROM produtos", (err, row) => {
    if (row.count === 0) {
      const produtos = [
        ['Bolo de Chocolate', 'Massa fofinha com cobertura de brigadeiro', 'R$ 45,00', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300', 1],
        ['Torta de Limão', 'Mousse de limão siciliano com merengue', 'R$ 35,00', 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=300', 1],
        ['Bolo de Cenoura', 'Com cobertura de chocolate meio amargo', 'R$ 40,00', 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=300', 1],
        ['Bolo de Morango', 'Recheio de morango fresco com chantilly', 'R$ 50,00', 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=300', 0]
      ];
      const stmt = db.prepare("INSERT INTO produtos (nome, descricao, preco, imagem, destaque) VALUES (?, ?, ?, ?, ?)");
      produtos.forEach(p => stmt.run(p));
      stmt.finalize();
    }
  });

  db.get("SELECT COUNT(*) as count FROM avaliacoes", (err, row) => {
    if (row.count === 0) {
      const avaliacoes = [
        ['Maria Silva', 5, 'Melhor bolo que já comi! Muito fofo e saboroso.'],
        ['João Pereira', 5, 'Atendimento excelente e produtos de qualidade.'],
        ['Ana Costa', 4, 'Torta de limão maravilhosa, voltarei mais vezes!']
      ];
      const stmt = db.prepare("INSERT INTO avaliacoes (nome, rating, texto) VALUES (?, ?, ?)");
      avaliacoes.forEach(a => stmt.run(a));
      stmt.finalize();
    }
  });

  db.get("SELECT COUNT(*) as count FROM admin", (err, row) => {
    if (row.count === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
      console.log('✅ Usuário admin: admin / admin123');
    }
  });
});

// ============= ROTAS =============

// Produtos
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM produtos ORDER BY destaque DESC, id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Avaliações
app.get('/api/reviews', (req, res) => {
  db.all("SELECT * FROM avaliacoes ORDER BY data DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Criar avaliação
app.post('/api/reviews', (req, res) => {
  const { nome, rating, texto } = req.body;
  if (!nome || !rating || !texto) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  db.run("INSERT INTO avaliacoes (nome, rating, texto) VALUES (?, ?, ?)",
    [nome, rating, texto],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Avaliação enviada!' });
    }
  );
});

// Pedidos
app.post('/api/pedidos', (req, res) => {
  const { cliente_nome, cliente_telefone, pedido } = req.body;
  if (!cliente_nome || !cliente_telefone || !pedido) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  db.run("INSERT INTO pedidos (cliente_nome, cliente_telefone, pedido) VALUES (?, ?, ?)",
    [cliente_nome, cliente_telefone, pedido],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Pedido enviado!' });
    }
  );
});

// Login Admin
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    if (bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
  });
});

// Middleware Admin
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'Token não fornecido' });
  jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = decoded;
    next();
  });
}

// CRUD Produtos (Admin)
app.get('/api/admin/produtos', verifyToken, (req, res) => {
  db.all("SELECT * FROM produtos ORDER BY id DESC", (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/admin/produtos', verifyToken, (req, res) => {
  const { nome, descricao, preco, imagem, destaque } = req.body;
  db.run("INSERT INTO produtos (nome, descricao, preco, imagem, destaque) VALUES (?, ?, ?, ?, ?)",
    [nome, descricao, preco, imagem, destaque || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/admin/produtos/:id', verifyToken, (req, res) => {
  const { nome, descricao, preco, imagem, destaque } = req.body;
  db.run("UPDATE produtos SET nome=?, descricao=?, preco=?, imagem=?, destaque=? WHERE id=?",
    [nome, descricao, preco, imagem, destaque || 0, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Produto atualizado' });
    }
  );
});

app.delete('/api/admin/produtos/:id', verifyToken, (req, res) => {
  db.run("DELETE FROM produtos WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Produto removido' });
  });
});

// Pedidos (Admin)
app.get('/api/admin/pedidos', verifyToken, (req, res) => {
  db.all("SELECT * FROM pedidos ORDER BY created_at DESC", (err, rows) => {
    res.json(rows || []);
  });
});

app.put('/api/admin/pedidos/:id/status', verifyToken, (req, res) => {
  db.run("UPDATE pedidos SET status=? WHERE id=?", [req.body.status, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status atualizado' });
  });
});

// Stats
app.get('/api/admin/stats', verifyToken, (req, res) => {
  db.get("SELECT COUNT(*) as total FROM produtos", (err, row1) => {
    db.get("SELECT COUNT(*) as total FROM pedidos WHERE status='pendente'", (err, row2) => {
      db.get("SELECT AVG(rating) as media FROM avaliacoes", (err, row3) => {
        res.json({
          totalProdutos: row1?.total || 0,
          pedidosPendentes: row2?.total || 0,
          mediaAvaliacoes: row3?.media ? row3.media.toFixed(1) : 0
        });
      });
    });
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
  🎉 Servidor D'Melo rodando!
  📍 Porta: ${PORT}
  `);
});