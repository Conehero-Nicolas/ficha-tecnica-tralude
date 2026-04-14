const API_URL =
  "https://script.google.com/macros/s/AKfycbwtomi7uA8YBllh5ZaXDUUyKzTIm9rtdmiCsPYqJK7Hx7EPKduJyRIStbzwMCW3Lpw/exec";

// ── Estado global do app ───────────────────────────────────
const state = {
  produtos: [], // lista completa vinda da API
  produtosFiltrados: [],
  fichaAtual: null,
};

// ── Elementos do DOM ───────────────────────────────────────
const el = {
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
  container.innerHTML = `<span>⚠️ ${mensagem}</span>`;
  container.hidden = false;
}

// ── API: chamada genérica ──────────────────────────────────
async function chamarAPI(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), { method: "GET" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ── CARREGAR LISTA DE PRODUTOS ─────────────────────────────
async function carregarProdutos() {
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
    mostrarErro(
      el.statusLista,
      "Não foi possível conectar à base de dados. Verifique sua conexão.",
    );
  }
}

// ── RENDERIZAR LISTA ───────────────────────────────────────
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
    </li>
  `,
    )
    .join("");

  // Anexa clique em cada item
  el.lista.querySelectorAll(".produto-item").forEach((li) => {
    li.addEventListener("click", () => abrirFicha(li.dataset.produto));
  });
}

// ── FILTRO DE BUSCA ────────────────────────────────────────
function filtrarProdutos(termo) {
  const t = termo.trim().toLowerCase();
  state.produtosFiltrados = !t
    ? [...state.produtos]
    : state.produtos.filter((p) => p.toLowerCase().includes(t));
  renderizarLista();
}

// ── ABRIR FICHA DE UM PRODUTO ──────────────────────────────
async function abrirFicha(nomeProduto) {
  mostrarTela("ficha");

  // Esconde tudo e mostra só o spinner
  el.fichaConteudo.hidden = true;
  el.btnPdf.hidden = true;
  el.btnImprimir.hidden = true;
  el.statusFicha.hidden = false;
  el.statusFicha.className = "status";
  el.statusFicha.innerHTML =
    '<div class="spinner"></div><span>Carregando ficha técnica...</span>';

  try {
    const dados = await chamarAPI({ acao: "ficha", produto: nomeProduto });

    // Esconde o spinner IMEDIATAMENTE depois de ter os dados
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
    el.statusFicha.hidden = false;
    mostrarErro(el.statusFicha, "Erro ao buscar ficha técnica.");
  }
}

// ── RENDERIZAR FICHA ───────────────────────────────────────
function renderizarFicha(dados) {
  el.fichaTitulo.textContent = dados.produto;
  el.fichaData.textContent = dados.geradoEm;
  el.cardCusto.textContent = dados.custoTotal;
  el.cardItens.textContent = dados.totalItens;

  // Tabela (desktop)
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
      <td>${renderStatus(l.status)}</td>
    </tr>
  `,
    )
    .join("");

  // Cards (mobile)
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
      ${renderStatus(l.status)}
    </div>
  `,
    )
    .join("");
}

function renderStatus(status) {
  if (!status) return "";
  const ok = status.toLowerCase().includes("ok");
  const classe = ok ? "status-ok" : "status-alerta";
  return `<span class="${classe}">${escapeHtml(status)}</span>`;
}

// ── EXPORTAR PDF ───────────────────────────────────────────
function exportarPDF() {
  if (!state.fichaAtual) return;

  const nomeArquivo =
    `ficha-tecnica-${state.fichaAtual.produto}`
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

// ── UTILIDADES ─────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── EVENT LISTENERS ────────────────────────────────────────
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

// ── INICIALIZAÇÃO ──────────────────────────────────────────
carregarProdutos();
