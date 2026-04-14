/* ============================================================
   FICHA TÉCNICA PRO — v2 (com login)
   Lógica do app + chamadas à API + autenticação
   ============================================================ */

// ⚠️ IMPORTANTE: substitua pela SUA URL do Web App do Apps Script
const API_URL = "https://script.google.com/macros/s/COLE_SUA_URL_AQUI/exec";

// Chave usada pra guardar o token no navegador
const TOKEN_KEY = "jk_tralude_token";

// ── Estado global do app ───────────────────────────────────
const state = {
  token: null,
  produtos: [],
  produtosFiltrados: [],
  fichaAtual: null,
};

// ── Elementos do DOM ───────────────────────────────────────
const el = {
  // Login
  telaLogin: document.getElementById("tela-login"),
  formLogin: document.getElementById("form-login"),
  inputSenha: document.getElementById("senha"),
  loginErro: document.getElementById("login-erro"),
  btnLogin: document.getElementById("btn-login"),
  btnLoginLabel: document.querySelector(".login__btn-label"),
  btnLoginLoading: document.querySelector(".login__btn-loading"),

  // App
  app: document.getElementById("app"),
  btnSair: document.getElementById("btn-sair"),
  telaLista: document.getElementById("tela-lista"),
  telaFicha: document.getElementById("tela-ficha"),
  busca: document.getElementById("busca"),
  btnLimpar: document.getElementById("btn-limpar-busca"),
  statusLista: document.getElementById("status-lista"),
  contador: document.getElementById("contador"),
  lista: document.getElementById("lista-produtos"),
  btnVoltar: document.getElementById("btn-voltar"),
  statusFicha: document.getElementById("status-ficha"),
  fichaConteudo: document.getElementById("ficha-conteudo"),
  fichaTitulo: document.getElementById("ficha-titulo"),
  fichaData: document.getElementById("ficha-data"),
  cardCusto: document.getElementById("card-custo"),
  cardItens: document.getElementById("card-itens"),
  tabelaBody: document.getElementById("tabela-body"),
  insumosCards: document.getElementById("insumos-cards"),
  btnPdf: document.getElementById("btn-pdf"),
  btnImprimir: document.getElementById("btn-imprimir"),
};

// ── Helpers ────────────────────────────────────────────────
function mostrarTela(qual) {
  el.telaLista.classList.toggle("tela--ativa", qual === "lista");
  el.telaFicha.classList.toggle("tela--ativa", qual === "ficha");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarErro(container, mensagem) {
  container.className = "status status--erro";
  container.innerHTML = "<span>⚠️ " + escapeHtml(mensagem) + "</span>";
  container.hidden = false;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── API: chamada genérica ──────────────────────────────────
async function chamarAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  // Se tivermos token e a ação não for login, anexa
  if (state.token && params.acao !== "login") {
    url.searchParams.set("token", state.token);
  }

  const resp = await fetch(url.toString(), { method: "GET" });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const dados = await resp.json();

  // Se o backend retornar TOKEN_INVALIDO, força logout
  if (dados && dados.codigo === "TOKEN_INVALIDO") {
    fazerLogout(true);
    throw new Error("Sessão expirada");
  }

  return dados;
}

// ============================================================
//  AUTENTICAÇÃO
// ============================================================

// Salva token no localStorage com sua data de expiração
function salvarToken(token, expiraEm) {
  const pacote = { token: token, expiraEm: expiraEm };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(pacote));
  state.token = token;
}

// Recupera token do localStorage se ainda válido
function carregarTokenSalvo() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const pacote = JSON.parse(raw);
    if (!pacote.token || !pacote.expiraEm) return null;
    if (Date.now() > pacote.expiraEm) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return pacote.token;
  } catch (e) {
    return null;
  }
}

function limparToken() {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
}

// Fluxo de login
async function fazerLogin(senha) {
  el.loginErro.hidden = true;
  el.btnLogin.disabled = true;
  el.btnLoginLabel.hidden = true;
  el.btnLoginLoading.hidden = false;

  try {
    const dados = await chamarAPI({ acao: "login", senha: senha });

    if (!dados.sucesso) {
      el.loginErro.textContent = dados.mensagem || "Erro ao entrar.";
      el.loginErro.hidden = false;
      return;
    }

    salvarToken(dados.token, dados.expiraEm);
    entrarNoApp();
  } catch (err) {
    console.error(err);
    el.loginErro.textContent = "Não foi possível conectar ao servidor.";
    el.loginErro.hidden = false;
  } finally {
    el.btnLogin.disabled = false;
    el.btnLoginLabel.hidden = false;
    el.btnLoginLoading.hidden = true;
  }
}

// Logout — se "expirou" = true, mostra mensagem amigável
function fazerLogout(expirou) {
  limparToken();
  state.produtos = [];
  state.produtosFiltrados = [];
  state.fichaAtual = null;

  // Limpa inputs e telas
  el.inputSenha.value = "";
  el.busca.value = "";
  el.lista.innerHTML = "";
  el.contador.hidden = true;

  mostrarTela("lista");
  el.app.hidden = true;
  el.telaLogin.hidden = false;

  if (expirou) {
    el.loginErro.textContent = "Sua sessão expirou. Faça login novamente.";
    el.loginErro.hidden = false;
  }

  setTimeout(() => el.inputSenha.focus(), 100);
}

// Entra no app depois do login
function entrarNoApp() {
  el.telaLogin.hidden = true;
  el.app.hidden = false;
  mostrarTela("lista");
  carregarProdutos();
}

// ============================================================
//  LISTA DE PRODUTOS
// ============================================================
async function carregarProdutos() {
  el.statusLista.hidden = false;
  el.statusLista.className = "status";
  el.statusLista.innerHTML =
    '<div class="spinner"></div><span>Carregando produtos...</span>';
  el.contador.hidden = true;
  el.lista.innerHTML = "";

  try {
    const dados = await chamarAPI({ acao: "listarProdutos" });

    if (!dados.sucesso) {
      mostrarErro(
        el.statusLista,
        dados.mensagem || "Falha ao carregar produtos.",
      );
      return;
    }

    state.produtos = dados.produtos || [];
    state.produtosFiltrados = [...state.produtos];

    el.statusLista.hidden = true;
    renderizarLista();
  } catch (err) {
    console.error(err);
    if (err.message !== "Sessão expirada") {
      mostrarErro(
        el.statusLista,
        "Não foi possível conectar à base de dados. Verifique sua conexão.",
      );
    }
  }
}

function renderizarLista() {
  const lista = state.produtosFiltrados;

  el.contador.hidden = false;
  el.contador.textContent =
    lista.length === state.produtos.length
      ? lista.length + " produtos"
      : lista.length + " de " + state.produtos.length + " produtos";

  if (lista.length === 0) {
    el.lista.innerHTML =
      '<li style="text-align:center; padding:32px; color:var(--text-muted);">' +
      "Nenhum produto encontrado.</li>";
    return;
  }

  el.lista.innerHTML = lista
    .map(
      (nome) =>
        '<li class="produto-item" data-produto="' +
        escapeHtml(nome) +
        '">' +
        '<span class="produto-item__nome">' +
        escapeHtml(nome) +
        "</span>" +
        '<svg class="produto-item__seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<path d="m9 18 6-6-6-6"/>' +
        "</svg>" +
        "</li>",
    )
    .join("");

  el.lista.querySelectorAll(".produto-item").forEach((li) => {
    li.addEventListener("click", () => abrirFicha(li.dataset.produto));
  });
}

function filtrarProdutos(termo) {
  const t = termo.trim().toLowerCase();
  state.produtosFiltrados = !t
    ? [...state.produtos]
    : state.produtos.filter((p) => p.toLowerCase().includes(t));
  renderizarLista();
}

// ============================================================
//  FICHA TÉCNICA
// ============================================================
async function abrirFicha(nomeProduto) {
  mostrarTela("ficha");

  el.fichaConteudo.hidden = true;
  el.btnPdf.hidden = true;
  el.btnImprimir.hidden = true;
  el.statusFicha.hidden = false;
  el.statusFicha.className = "status";
  el.statusFicha.innerHTML =
    '<div class="spinner"></div><span>Carregando ficha técnica...</span>';

  try {
    const dados = await chamarAPI({ acao: "ficha", produto: nomeProduto });

    el.statusFicha.hidden = true;

    if (!dados.sucesso) {
      mostrarErro(el.statusFicha, dados.mensagem || "Ficha não encontrada.");
      return;
    }

    state.fichaAtual = dados;
    renderizarFicha(dados);

    el.fichaConteudo.hidden = false;
    el.btnPdf.hidden = false;
    el.btnImprimir.hidden = false;
  } catch (err) {
    console.error(err);
    if (err.message !== "Sessão expirada") {
      el.statusFicha.hidden = false;
      mostrarErro(el.statusFicha, "Erro ao buscar ficha técnica.");
    }
  }
}

function renderizarFicha(dados) {
  el.fichaTitulo.textContent = dados.produto;
  el.fichaData.textContent = dados.geradoEm;
  el.cardCusto.textContent = dados.custoTotal;
  el.cardItens.textContent = dados.totalItens;

  el.tabelaBody.innerHTML = dados.linhas
    .map(
      (l) =>
        "<tr>" +
        '<td class="insumo-nome">' +
        escapeHtml(l.insumo) +
        "</td>" +
        '<td class="num">' +
        escapeHtml(l.rsUnid) +
        "</td>" +
        '<td class="num">' +
        escapeHtml(l.qtde) +
        "</td>" +
        "<td>" +
        escapeHtml(l.un) +
        "</td>" +
        '<td class="num total-valor">' +
        escapeHtml(l.total) +
        "</td>" +
        '<td class="num part-valor">' +
        escapeHtml(l.part) +
        "</td>" +
        "<td>" +
        renderStatus(l.status) +
        "</td>" +
        "</tr>",
    )
    .join("");

  el.insumosCards.innerHTML = dados.linhas
    .map(
      (l) =>
        '<div class="insumo-card">' +
        '<div class="insumo-card__nome">' +
        escapeHtml(l.insumo) +
        "</div>" +
        '<div class="insumo-card__grid">' +
        '<div class="insumo-card__item">' +
        '<span class="insumo-card__item-label">R$ Unit.</span>' +
        '<span class="insumo-card__item-valor">' +
        escapeHtml(l.rsUnid) +
        "</span>" +
        "</div>" +
        '<div class="insumo-card__item">' +
        '<span class="insumo-card__item-label">Qtde</span>' +
        '<span class="insumo-card__item-valor">' +
        escapeHtml(l.qtde) +
        " " +
        escapeHtml(l.un) +
        "</span>" +
        "</div>" +
        '<div class="insumo-card__item">' +
        '<span class="insumo-card__item-label">Total</span>' +
        '<span class="insumo-card__item-valor insumo-card__total">' +
        escapeHtml(l.total) +
        "</span>" +
        "</div>" +
        '<div class="insumo-card__item">' +
        '<span class="insumo-card__item-label">% Part.</span>' +
        '<span class="insumo-card__item-valor insumo-card__part">' +
        escapeHtml(l.part) +
        "</span>" +
        "</div>" +
        "</div>" +
        renderStatus(l.status) +
        "</div>",
    )
    .join("");
}

function renderStatus(status) {
  if (!status) return "";
  const ok = status.toLowerCase().includes("ok");
  const classe = ok ? "status-ok" : "status-alerta";
  return '<span class="' + classe + '">' + escapeHtml(status) + "</span>";
}

// ============================================================
//  EXPORTAR PDF
// ============================================================
function exportarPDF() {
  if (!state.fichaAtual) return;

  const nomeArquivo =
    ("ficha-tecnica-" + state.fichaAtual.produto)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".pdf";

  const elemento = el.fichaConteudo;

  html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: nomeArquivo,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(elemento)
    .save();
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
el.formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  const senha = el.inputSenha.value.trim();
  if (senha) fazerLogin(senha);
});

el.btnSair.addEventListener("click", () => {
  if (confirm("Deseja realmente sair?")) fazerLogout(false);
});

el.busca.addEventListener("input", (e) => {
  const valor = e.target.value;
  el.btnLimpar.classList.toggle("ativo", valor.length > 0);
  filtrarProdutos(valor);
});

el.btnLimpar.addEventListener("click", () => {
  el.busca.value = "";
  el.btnLimpar.classList.remove("ativo");
  filtrarProdutos("");
  el.busca.focus();
});

el.btnVoltar.addEventListener("click", () => mostrarTela("lista"));
el.btnPdf.addEventListener("click", exportarPDF);
el.btnImprimir.addEventListener("click", () => window.print());

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
function iniciar() {
  const tokenSalvo = carregarTokenSalvo();
  if (tokenSalvo) {
    // Já tem token válido localmente → entra direto
    state.token = tokenSalvo;
    entrarNoApp();
  } else {
    // Mostra tela de login
    el.telaLogin.hidden = false;
    el.app.hidden = true;
    setTimeout(() => el.inputSenha.focus(), 100);
  }
}

iniciar();
