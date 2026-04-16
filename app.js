// ============================================================
//  FICHA TÉCNICA PRO — app.js v3.0
//  Novidades: login, editor de ficha, preview ao vivo, escrita
// ============================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwtomi7uA8YBllh5ZaXDUUyKzTIm9rtdmiCsPYqJK7Hx7EPKduJyRIStbzwMCW3Lpw/exec";

// Chave do token no sessionStorage
const TOKEN_KEY = "ft_auth_token";
const TOKEN_EXP_KEY = "ft_auth_exp";

// ── Estado global ──────────────────────────────────────────
const state = {
  produtos: [],
  produtosFiltrados: [],
  fichas: {},
  logoUrl: "",
  fichaAtual: null,

  // auth
  token: null,
  tokenExp: 0,

  // insumos (cache do dropdown)
  insumos: [], // [{ nome, unidade, custoPorUni }]
  insumosPorNome: {}, // nome → { unidade, custoPorUni }

  // editor
  modoEditor: null, // "novo" | "editar" | null
  editorProdutoOriginal: "",
};

// ── DOM ────────────────────────────────────────────────────
const el = {
  brandClick: document.getElementById("brand-click"),
  brandLogoImg: document.getElementById("brand-logo-img"),
  brandLogoFallback: document.getElementById("brand-logo-fallback"),

  btnLogin: document.getElementById("btn-login"),
  loginInfo: document.getElementById("login-info"),
  btnLogout: document.getElementById("btn-logout"),

  telaLista: document.getElementById("tela-lista"),
  telaFicha: document.getElementById("tela-ficha"),
  busca: document.getElementById("busca"),
  btnLimpar: document.getElementById("btn-limpar-busca"),
  btnNovoProduto: document.getElementById("btn-novo-produto"),
  statusLista: document.getElementById("status-lista"),
  contador: document.getElementById("contador"),
  lista: document.getElementById("lista-produtos"),

  btnVoltar: document.getElementById("btn-voltar"),
  statusFicha: document.getElementById("status-ficha"),
  fichaConteudo: document.getElementById("ficha-conteudo"),
  fichaTitulo: document.getElementById("ficha-titulo"),
  fichaData: document.getElementById("ficha-data"),
  fichaFoto: document.getElementById("ficha-foto"),
  fichaFotoPlaceholder: document.getElementById("ficha-foto-placeholder"),
  cardCusto: document.getElementById("card-custo"),
  cardItens: document.getElementById("card-itens"),
  tabelaBody: document.getElementById("tabela-body"),
  insumosCards: document.getElementById("insumos-cards"),
  btnPdf: document.getElementById("btn-pdf"),
  btnImprimir: document.getElementById("btn-imprimir"),
  btnEditar: document.getElementById("btn-editar"),
  btnDeletar: document.getElementById("btn-deletar"),

  // modais
  modalLogin: document.getElementById("modal-login"),
  formLogin: document.getElementById("form-login"),
  senhaInput: document.getElementById("senha-input"),
  loginErro: document.getElementById("login-erro"),
  btnLoginSubmit: document.getElementById("btn-login-submit"),

  modalEditor: document.getElementById("modal-editor"),
  editorTitulo: document.getElementById("editor-titulo"),
  editorProduto: document.getElementById("editor-produto"),
  editorImagem: document.getElementById("editor-imagem"),
  editorLinhas: document.getElementById("editor-linhas"),
  editorErro: document.getElementById("editor-erro"),
  btnAddInsumo: document.getElementById("btn-add-insumo"),
  btnEditorSalvar: document.getElementById("btn-editor-salvar"),
  previewCusto: document.getElementById("preview-custo"),
  previewItens: document.getElementById("preview-itens"),

  modalConfirm: document.getElementById("modal-confirm"),
  confirmTitulo: document.getElementById("confirm-titulo"),
  confirmMsg: document.getElementById("confirm-msg"),
  confirmOk: document.getElementById("confirm-ok"),
  confirmCancelar: document.getElementById("confirm-cancelar"),

  toast: document.getElementById("toast"),
  datalistInsumos: document.getElementById("datalist-insumos"),
};

// ============================================================
//  HELPERS
// ============================================================

function normalizarUrlImagem(url) {
  if (!url) return "";
  url = String(url).trim();
  if (!url) return "";
  let id = "";
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  if (!id) {
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) id = m[1];
  }
  if (id) return "https://lh3.googleusercontent.com/d/" + id;
  return url;
}

function mostrarTela(qual) {
  el.telaLista.classList.toggle("tela--ativa", qual === "lista");
  el.telaFicha.classList.toggle("tela--ativa", qual === "ficha");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarErro(container, mensagem) {
  container.className = "status status--erro";
  container.innerHTML = `<span>⚠️ ${mensagem}</span>`;
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

function formatarMoeda(num) {
  return (num || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Parseia string brasileira "1,5" → 1.5 */
function parseNum(str) {
  if (typeof str === "number") return str;
  if (!str) return 0;
  const s = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── TOAST ──────────────────────────────────────────────────
let toastTimer = null;
function mostrarToast(msg, tipo = "ok", duracao = 3200) {
  clearTimeout(toastTimer);
  el.toast.textContent = msg;
  el.toast.className = "toast toast--" + tipo;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => (el.toast.hidden = true), duracao);
}

// ── CONFIRMAÇÃO (retorna Promise) ──────────────────────────
function confirmar({ titulo, mensagem, okLabel = "Confirmar" }) {
  return new Promise((resolve) => {
    el.confirmTitulo.textContent = titulo || "Confirmar";
    el.confirmMsg.textContent = mensagem || "";
    el.confirmOk.textContent = okLabel;
    el.modalConfirm.hidden = false;

    const cleanup = () => {
      el.modalConfirm.hidden = true;
      el.confirmOk.removeEventListener("click", onOk);
      el.confirmCancelar.removeEventListener("click", onCancel);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    el.confirmOk.addEventListener("click", onOk);
    el.confirmCancelar.addEventListener("click", onCancel);
  });
}

// ============================================================
//  API
// ============================================================

async function chamarAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { method: "GET" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

/**
 * POST com text/plain pra evitar preflight CORS.
 * Apps Script lê o corpo como string e nós parseamos como JSON lá dentro.
 */
async function chamarAPIPost(acao, dados = {}) {
  const body = JSON.stringify({ acao, ...dados });
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: body,
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ============================================================
//  AUTENTICAÇÃO (client-side)
// ============================================================

function carregarTokenLocal() {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY);
    const exp = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || "0", 10);
    if (!t || !exp || Date.now() >= exp) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXP_KEY);
      return false;
    }
    state.token = t;
    state.tokenExp = exp;
    return true;
  } catch (e) {
    return false;
  }
}

function salvarTokenLocal(token, expiraEm) {
  state.token = token;
  state.tokenExp = expiraEm;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(expiraEm));
  } catch (e) {}
}

function limparTokenLocal() {
  state.token = null;
  state.tokenExp = 0;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  } catch (e) {}
}

function estaLogado() {
  return !!state.token && Date.now() < state.tokenExp;
}

function atualizarUILogin() {
  const logado = estaLogado();
  el.btnLogin.hidden = logado;
  el.loginInfo.hidden = !logado;
  el.btnNovoProduto.hidden = !logado;

  // Botões da ficha (só se há ficha aberta)
  if (state.fichaAtual) {
    el.btnEditar.hidden = !logado;
    el.btnDeletar.hidden = !logado;
  }
}

async function fazerLogin(senha) {
  el.btnLoginSubmit.disabled = true;
  el.btnLoginSubmit.textContent = "Entrando...";
  el.loginErro.hidden = true;

  try {
    const resp = await chamarAPIPost("login", { senha });
    if (!resp.sucesso) {
      el.loginErro.textContent = resp.mensagem || "Senha incorreta.";
      el.loginErro.hidden = false;
      return;
    }
    salvarTokenLocal(resp.token, resp.expiraEm);
    fecharModal(el.modalLogin);
    atualizarUILogin();

    // Pré-carrega insumos para deixar o editor responsivo
    carregarInsumos().catch(() => {});

    mostrarToast("🔓 Modo edição ativado", "ok");
    el.senhaInput.value = "";
  } catch (err) {
    el.loginErro.textContent = "Erro de conexão. Tente novamente.";
    el.loginErro.hidden = false;
  } finally {
    el.btnLoginSubmit.disabled = false;
    el.btnLoginSubmit.textContent = "Entrar";
  }
}

function fazerLogout() {
  limparTokenLocal();
  atualizarUILogin();
  mostrarToast("Você saiu do modo edição", "ok");
}

// ============================================================
//  BOOT
// ============================================================

async function carregarTudo() {
  try {
    const dados = await chamarAPI({ acao: "tudo" });
    if (!dados.sucesso) {
      mostrarErro(el.statusLista, dados.mensagem || "Falha ao carregar dados.");
      return;
    }
    state.produtos = dados.produtos || [];
    state.produtosFiltrados = [...state.produtos];
    state.fichas = dados.fichas || {};
    state.logoUrl = normalizarUrlImagem(dados.logoUrl || "");

    aplicarLogo();
    el.statusLista.hidden = true;
    renderizarLista();
  } catch (err) {
    console.error(err);
    mostrarErro(
      el.statusLista,
      "Não foi possível conectar à base de dados. Verifique sua conexão.",
    );
  }
}

async function carregarInsumos() {
  // Cache simples em memória
  if (state.insumos.length) return state.insumos;

  const resp = await chamarAPI({ acao: "listarInsumos" });
  if (!resp.sucesso)
    throw new Error(resp.mensagem || "Falha ao carregar insumos");

  state.insumos = resp.insumos || [];
  state.insumosPorNome = {};
  state.insumos.forEach((i) => {
    state.insumosPorNome[i.nome] = {
      unidade: i.unidade,
      custoPorUni: i.custoPorUni,
    };
  });

  // Popula o datalist
  el.datalistInsumos.innerHTML = state.insumos
    .map((i) => `<option value="${escapeHtml(i.nome)}"></option>`)
    .join("");

  return state.insumos;
}

// ── LOGO ───────────────────────────────────────────────────
function aplicarLogo() {
  if (!state.logoUrl) return;
  el.brandLogoImg.src = state.logoUrl;
  el.brandLogoImg.onload = () => {
    el.brandLogoImg.hidden = false;
    el.brandLogoFallback.hidden = true;
  };
  el.brandLogoImg.onerror = () => {
    el.brandLogoImg.hidden = true;
    el.brandLogoFallback.hidden = false;
  };
}

// ============================================================
//  LISTA
// ============================================================

function renderizarLista() {
  const lista = state.produtosFiltrados;
  el.contador.hidden = false;
  el.contador.textContent =
    lista.length === state.produtos.length
      ? `${lista.length} produtos`
      : `${lista.length} de ${state.produtos.length} produtos`;

  if (lista.length === 0) {
    el.lista.innerHTML = `
      <li style="text-align:center; padding:32px; color:var(--text-muted);">
        Nenhum produto encontrado.
      </li>`;
    return;
  }

  el.lista.innerHTML = lista
    .map(
      (nome) => `
    <li class="produto-item" data-produto="${escapeHtml(nome)}">
      <span class="produto-item__nome">${escapeHtml(nome)}</span>
      <svg class="produto-item__seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </li>`,
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
//  ABRIR / RENDERIZAR FICHA
// ============================================================

function abrirFicha(nomeProduto) {
  mostrarTela("ficha");

  const ficha = state.fichas[nomeProduto];
  if (!ficha) {
    el.fichaConteudo.hidden = true;
    el.btnPdf.hidden = true;
    el.btnImprimir.hidden = true;
    el.btnEditar.hidden = true;
    el.btnDeletar.hidden = true;
    mostrarErro(el.statusFicha, "Ficha não encontrada.");
    return;
  }

  el.statusFicha.hidden = true;
  state.fichaAtual = ficha;
  renderizarFicha(ficha);

  el.fichaConteudo.hidden = false;
  el.btnPdf.hidden = false;
  el.btnImprimir.hidden = false;

  const logado = estaLogado();
  el.btnEditar.hidden = !logado;
  el.btnDeletar.hidden = !logado;
}

function renderizarFicha(dados) {
  el.fichaTitulo.textContent = dados.produto;
  el.fichaData.textContent = dados.geradoEm;
  el.cardCusto.textContent = dados.custoTotal;
  el.cardItens.textContent = dados.totalItens;

  const fotoUrl = normalizarUrlImagem(dados.imagemUrl || "");
  if (fotoUrl) {
    el.fichaFoto.src = fotoUrl;
    el.fichaFoto.alt = dados.produto;
    el.fichaFoto.onload = () => {
      el.fichaFoto.hidden = false;
      el.fichaFotoPlaceholder.hidden = true;
    };
    el.fichaFoto.onerror = () => {
      el.fichaFoto.hidden = true;
      el.fichaFotoPlaceholder.hidden = false;
    };
  } else {
    el.fichaFoto.hidden = true;
    el.fichaFotoPlaceholder.hidden = false;
  }

  el.tabelaBody.innerHTML = dados.linhas
    .map(
      (l) => `
    <tr>
      <td class="insumo-nome">${escapeHtml(l.insumo)}</td>
      <td class="num">${escapeHtml(l.rsUnid)}</td>
      <td class="num">${escapeHtml(l.qtde)}</td>
      <td>${escapeHtml(l.un)}</td>
      <td class="num total-valor">${escapeHtml(l.total)}</td>
      <td class="num part-valor">${escapeHtml(l.part)}</td>
    </tr>`,
    )
    .join("");

  el.insumosCards.innerHTML = dados.linhas
    .map(
      (l) => `
    <div class="insumo-card">
      <div class="insumo-card__nome">${escapeHtml(l.insumo)}</div>
      <div class="insumo-card__grid">
        <div class="insumo-card__item">
          <span class="insumo-card__item-label">R$ Unit.</span>
          <span class="insumo-card__item-valor">${escapeHtml(l.rsUnid)}</span>
        </div>
        <div class="insumo-card__item">
          <span class="insumo-card__item-label">Qtde</span>
          <span class="insumo-card__item-valor">${escapeHtml(l.qtde)} ${escapeHtml(l.un)}</span>
        </div>
        <div class="insumo-card__item">
          <span class="insumo-card__item-label">Total</span>
          <span class="insumo-card__item-valor insumo-card__total">${escapeHtml(l.total)}</span>
        </div>
        <div class="insumo-card__item">
          <span class="insumo-card__item-label">% Part.</span>
          <span class="insumo-card__item-valor insumo-card__part">${escapeHtml(l.part)}</span>
        </div>
      </div>
    </div>`,
    )
    .join("");
}

// ============================================================
//  PDF
// ============================================================

function exportarPDF() {
  if (!state.fichaAtual) return;
  const nomeArquivo =
    `ficha-tecnica-${state.fichaAtual.produto}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".pdf";

  html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: nomeArquivo,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(el.fichaConteudo)
    .save();
}

// ============================================================
//  MODAIS (genérico abrir/fechar)
// ============================================================

function abrirModal(modalEl) {
  modalEl.hidden = false;
}
function fecharModal(modalEl) {
  modalEl.hidden = true;
}

// ============================================================
//  EDITOR DE FICHA
// ============================================================

async function abrirEditor(modo, produtoExistente = null) {
  if (!estaLogado()) {
    mostrarToast("Sessão expirada. Faça login novamente.", "erro");
    return;
  }

  state.modoEditor = modo;
  state.editorProdutoOriginal = produtoExistente
    ? produtoExistente.produto
    : "";

  // Carrega insumos se ainda não carregou
  try {
    await carregarInsumos();
  } catch (err) {
    mostrarToast("Falha ao carregar lista de insumos.", "erro");
    return;
  }

  el.editorErro.hidden = true;

  if (modo === "novo") {
    el.editorTitulo.textContent = "➕ Novo produto";
    el.editorProduto.value = "";
    el.editorProduto.disabled = false;
    el.editorImagem.value = "";
    renderizarLinhasEditor([{ insumo: "", qtde: "" }]);
  } else {
    el.editorTitulo.textContent = "✏️ Editar: " + produtoExistente.produto;
    el.editorProduto.value = produtoExistente.produto;
    el.editorProduto.disabled = true; // evita renomear (complicaria a lógica)
    el.editorImagem.value = produtoExistente.imagemUrl || "";

    // Converte as linhas formatadas de volta em {insumo, qtde}
    const linhasEdit = produtoExistente.linhas.map((l) => ({
      insumo: l.insumo,
      qtde: l.qtde === "—" ? "" : l.qtde,
    }));
    renderizarLinhasEditor(linhasEdit);
  }

  recalcularPreview();
  abrirModal(el.modalEditor);
  setTimeout(() => {
    if (modo === "novo") el.editorProduto.focus();
  }, 50);
}

function renderizarLinhasEditor(linhas) {
  if (!linhas.length) {
    el.editorLinhas.innerHTML =
      '<div class="editor-linhas__vazio">Nenhum insumo. Clique em "Adicionar" para começar.</div>';
    return;
  }

  el.editorLinhas.innerHTML = linhas
    .map(
      (l, idx) => `
    <div class="editor-linha" data-idx="${idx}">
      <input
        type="text"
        class="editor-linha__insumo"
        list="datalist-insumos"
        placeholder="Digite ou selecione o insumo..."
        value="${escapeHtml(l.insumo || "")}"
        autocomplete="off"
      />
      <input
        type="text"
        class="editor-linha__qtde"
        placeholder="Qtde"
        value="${escapeHtml(l.qtde || "")}"
        inputmode="decimal"
      />
      <button
        type="button"
        class="editor-linha__remover"
        aria-label="Remover insumo"
        title="Remover"
      >🗑️</button>
    </div>`,
    )
    .join("");

  // Listeners
  el.editorLinhas.querySelectorAll(".editor-linha").forEach((linha) => {
    const insumoInput = linha.querySelector(".editor-linha__insumo");
    const qtdeInput = linha.querySelector(".editor-linha__qtde");
    const btnRemover = linha.querySelector(".editor-linha__remover");

    insumoInput.addEventListener("input", recalcularPreview);
    qtdeInput.addEventListener("input", recalcularPreview);
    btnRemover.addEventListener("click", () => {
      linha.remove();
      if (!el.editorLinhas.querySelector(".editor-linha")) {
        el.editorLinhas.innerHTML =
          '<div class="editor-linhas__vazio">Nenhum insumo. Clique em "Adicionar" para começar.</div>';
      }
      recalcularPreview();
    });
  });
}

function adicionarLinhaEditor() {
  // Remove placeholder "vazio" se houver
  const vazio = el.editorLinhas.querySelector(".editor-linhas__vazio");
  if (vazio) vazio.remove();

  const idx = el.editorLinhas.querySelectorAll(".editor-linha").length;
  const div = document.createElement("div");
  div.className = "editor-linha";
  div.dataset.idx = idx;
  div.innerHTML = `
    <input
      type="text"
      class="editor-linha__insumo"
      list="datalist-insumos"
      placeholder="Digite ou selecione o insumo..."
      autocomplete="off"
    />
    <input
      type="text"
      class="editor-linha__qtde"
      placeholder="Qtde"
      inputmode="decimal"
    />
    <button
      type="button"
      class="editor-linha__remover"
      aria-label="Remover insumo"
      title="Remover"
    >🗑️</button>
  `;
  el.editorLinhas.appendChild(div);

  const insumoInput = div.querySelector(".editor-linha__insumo");
  const qtdeInput = div.querySelector(".editor-linha__qtde");
  const btnRemover = div.querySelector(".editor-linha__remover");

  insumoInput.addEventListener("input", recalcularPreview);
  qtdeInput.addEventListener("input", recalcularPreview);
  btnRemover.addEventListener("click", () => {
    div.remove();
    if (!el.editorLinhas.querySelector(".editor-linha")) {
      el.editorLinhas.innerHTML =
        '<div class="editor-linhas__vazio">Nenhum insumo. Clique em "Adicionar" para começar.</div>';
    }
    recalcularPreview();
  });

  insumoInput.focus();
  recalcularPreview();
}

function coletarLinhasEditor() {
  const linhas = [];
  el.editorLinhas.querySelectorAll(".editor-linha").forEach((linha) => {
    const insumo = linha.querySelector(".editor-linha__insumo").value.trim();
    const qtdeStr = linha.querySelector(".editor-linha__qtde").value.trim();
    linhas.push({ insumo, qtde: qtdeStr });
  });
  return linhas;
}

function recalcularPreview() {
  const linhas = coletarLinhasEditor();
  let total = 0;
  let itens = 0;

  linhas.forEach((l) => {
    if (!l.insumo || !l.qtde) return;
    const info = state.insumosPorNome[l.insumo];
    if (!info) return; // insumo não existe no cadastro
    const qtde = parseNum(l.qtde);
    if (qtde <= 0) return;
    total += qtde * (info.custoPorUni || 0);
    itens++;
  });

  el.previewCusto.textContent = formatarMoeda(total);
  el.previewItens.textContent = String(itens);
}

async function salvarFicha() {
  el.editorErro.hidden = true;

  const produto = el.editorProduto.value.trim();
  const imagemUrl = el.editorImagem.value.trim();
  const linhasRaw = coletarLinhasEditor();

  // Validações
  if (!produto) {
    el.editorErro.textContent = "Digite o nome do produto.";
    el.editorErro.hidden = false;
    return;
  }

  if (state.modoEditor === "novo") {
    // Confere duplicidade (case-insensitive, normalizado)
    const existe = state.produtos.some(
      (p) => p.toLowerCase() === produto.toLowerCase(),
    );
    if (existe) {
      el.editorErro.textContent =
        "Já existe um produto com esse nome. Abra a ficha existente para editá-la.";
      el.editorErro.hidden = false;
      return;
    }
  }

  // Limpa linhas vazias e valida
  const linhas = linhasRaw
    .filter((l) => l.insumo || l.qtde)
    .map((l) => ({ insumo: l.insumo, qtde: parseNum(l.qtde) }));

  if (linhas.length === 0) {
    el.editorErro.textContent = "Adicione pelo menos um insumo.";
    el.editorErro.hidden = false;
    return;
  }

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.insumo) {
      el.editorErro.textContent = `Linha ${i + 1}: selecione um insumo.`;
      el.editorErro.hidden = false;
      return;
    }
    if (!state.insumosPorNome[l.insumo]) {
      el.editorErro.textContent = `Linha ${i + 1}: "${l.insumo}" não está cadastrado na aba INSUMOS.`;
      el.editorErro.hidden = false;
      return;
    }
    if (!l.qtde || l.qtde <= 0) {
      el.editorErro.textContent = `Linha ${i + 1} (${l.insumo}): quantidade deve ser maior que zero.`;
      el.editorErro.hidden = false;
      return;
    }
  }

  // Envia
  el.btnEditorSalvar.disabled = true;
  el.btnEditorSalvar.textContent = "Salvando...";

  try {
    const resp = await chamarAPIPost("salvarFicha", {
      token: state.token,
      produto,
      imagemUrl,
      linhas,
    });

    if (!resp.sucesso) {
      el.editorErro.textContent = resp.mensagem || "Erro ao salvar.";
      el.editorErro.hidden = false;
      if (/sess[aã]o/i.test(resp.mensagem || "")) {
        limparTokenLocal();
        atualizarUILogin();
      }
      return;
    }

    fecharModal(el.modalEditor);
    mostrarToast("✅ Ficha salva com sucesso!", "ok");

    // Recarrega tudo e abre a ficha do produto salvo
    await recarregarAposEscrita(produto);
  } catch (err) {
    el.editorErro.textContent = "Erro de conexão. Tente novamente.";
    el.editorErro.hidden = false;
  } finally {
    el.btnEditorSalvar.disabled = false;
    el.btnEditorSalvar.textContent = "💾 Salvar";
  }
}

async function recarregarAposEscrita(produtoParaAbrir) {
  // Limpa o estado e recarrega
  state.produtos = [];
  state.fichas = {};
  state.fichaAtual = null;

  el.statusLista.hidden = false;
  el.statusLista.className = "status";
  el.statusLista.innerHTML =
    '<div class="spinner"></div><span>Atualizando...</span>';

  await carregarTudo();

  if (produtoParaAbrir && state.fichas[produtoParaAbrir]) {
    abrirFicha(produtoParaAbrir);
  } else {
    mostrarTela("lista");
  }
}

// ============================================================
//  DELETAR PRODUTO
// ============================================================

async function deletarProdutoAtual() {
  if (!state.fichaAtual) return;
  const nome = state.fichaAtual.produto;

  const ok = await confirmar({
    titulo: "🗑️ Deletar produto",
    mensagem: `Tem certeza que deseja remover "${nome}" e todas as suas linhas da planilha? Esta ação não pode ser desfeita.`,
    okLabel: "Sim, deletar",
  });
  if (!ok) return;

  try {
    const resp = await chamarAPIPost("deletarProduto", {
      token: state.token,
      produto: nome,
    });
    if (!resp.sucesso) {
      mostrarToast(resp.mensagem || "Erro ao deletar.", "erro");
      if (/sess[aã]o/i.test(resp.mensagem || "")) {
        limparTokenLocal();
        atualizarUILogin();
      }
      return;
    }
    mostrarToast("🗑️ Produto removido.", "ok");
    await recarregarAposEscrita(null);
  } catch (err) {
    mostrarToast("Erro de conexão.", "erro");
  }
}

// ============================================================
//  EVENTOS
// ============================================================

// Busca
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

// Navegação
el.btnVoltar.addEventListener("click", () => mostrarTela("lista"));
el.brandClick.addEventListener("click", () => mostrarTela("lista"));
el.brandClick.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    mostrarTela("lista");
  }
});

// PDF / Imprimir
el.btnPdf.addEventListener("click", exportarPDF);
el.btnImprimir.addEventListener("click", () => window.print());

// Login
el.btnLogin.addEventListener("click", () => {
  el.senhaInput.value = "";
  el.loginErro.hidden = true;
  abrirModal(el.modalLogin);
  setTimeout(() => el.senhaInput.focus(), 50);
});
el.btnLogout.addEventListener("click", fazerLogout);
el.formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  fazerLogin(el.senhaInput.value);
});

// Editar / Deletar
el.btnEditar.addEventListener("click", () => {
  if (!state.fichaAtual) return;
  abrirEditor("editar", state.fichaAtual);
});
el.btnDeletar.addEventListener("click", deletarProdutoAtual);
el.btnNovoProduto.addEventListener("click", () => abrirEditor("novo"));

// Editor
el.btnAddInsumo.addEventListener("click", adicionarLinhaEditor);
el.btnEditorSalvar.addEventListener("click", salvarFicha);

// Fechamento dos modais (data-close / data-close-editor / ESC)
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.matches("[data-close]") || t.closest("[data-close]")) {
    fecharModal(el.modalLogin);
  }
  if (t.matches("[data-close-editor]") || t.closest("[data-close-editor]")) {
    fecharModal(el.modalEditor);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!el.modalLogin.hidden) fecharModal(el.modalLogin);
    if (!el.modalEditor.hidden) fecharModal(el.modalEditor);
    if (!el.modalConfirm.hidden) {
      // Cancela confirmação
      el.confirmCancelar.click();
    }
  }
});

// ============================================================
//  BOOT
// ============================================================

carregarTokenLocal();
atualizarUILogin();
carregarTudo();

// Se já está logado, pré-carrega insumos em background
if (estaLogado()) {
  carregarInsumos().catch(() => {});
}
