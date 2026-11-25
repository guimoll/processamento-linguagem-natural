const MODELO_GEMINI = "gemini-3.5-flash-lite";
const NOMES = { emergency: "Emergência", urgent: "Urgente", non_urgent: "Não urgente", self_care: "Autocuidado", informational: "Informativo" };
const GRAVIDADE = ["self_care", "non_urgent", "urgent", "emergency"];
const $ = (id) => document.getElementById(id);

let modelo, stop, vocab, docs, idfDocs, vetDocs;

function tokens(texto) {
  return (texto.normalize("NFKC").toLowerCase().match(/[a-z]+/g) || []).filter((t) => !stop.has(t));
}

function tfidf(toks, indice, idf) {
  const v = new Map();
  for (const t of toks) if (indice.has(t)) v.set(indice.get(t), (v.get(indice.get(t)) || 0) + 1);
  let norma = 0;
  for (const [i, c] of v) { v.set(i, c * idf[i]); norma += (c * idf[i]) ** 2; }
  norma = Math.sqrt(norma) || 1;
  for (const [i, x] of v) v.set(i, x / norma);
  return v;
}

function classificar(texto) {
  const x = tfidf(tokens(texto), vocab, modelo.idf);
  const z = modelo.coef.map((w, k) => modelo.intercept[k] + [...x].reduce((s, [i, v]) => s + w[i] * v, 0));
  const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), soma = e.reduce((a, b) => a + b);
  return Object.fromEntries(modelo.classes.map((c, k) => [c, e[k] / soma]));
}

function buscar(texto, k = 5) {
  const q = tfidf(tokens(texto), idfDocs.indice, idfDocs.idf);
  return vetDocs.map((v, d) => [d, [...q].reduce((s, [i, x]) => s + x * (v.get(i) || 0), 0)])
    .sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([d, sim]) => ({ pagina: docs[d][0], url: docs[d][1], nivel: docs[d][2], texto: docs[d][3], sim }));
}

async function gemini(prompt, esquema, tentativa = 0) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": sessionStorage.getItem("chave") },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: esquema } }),
  });
  const d = await r.json();
  if ((r.status === 429 || r.status === 503) && tentativa < 3) {
    await new Promise((ok) => setTimeout(ok, 3000 * (tentativa + 1)));
    return gemini(prompt, esquema, tentativa + 1);
  }
  if (!r.ok) throw new Error(d.error?.message || r.status);
  return JSON.parse(d.candidates[0].content.parts[0].text);
}

const PROMPT_RESPOSTA = (msg, nivel, trechos) => `You are a symptom triage demo for a university NLP project. You are not a doctor.
Urgency levels used by the NHS:
- emergency: life-threatening, call 999 or go to A&E now
- urgent: needs help today, call NHS 111 or get an urgent GP appointment
- non_urgent: see a GP, not urgent
- self_care: can be treated at home or with a pharmacist

User message: ${msg}
Level predicted by the project's classifier: ${nivel}
NHS passages retrieved by the project's search:
${trechos.map((t, i) => `[${i + 1}] (${t.nivel}, ${t.pagina}) ${t.texto.slice(0, 500)}`).join("\n")}

Answer in Brazilian Portuguese, in at most 5 short sentences, using only the passages above.
The user is in Brazil, but do not mention it: say SAMU 192 or pronto-socorro instead of 999 or A&E, UPA instead of NHS 111, and posto de saúde instead of GP.
Set "level" to your own reading of the urgency. List in "sources" the numbers of the passages you used.`;

const ESQUEMA_RESPOSTA = { type: "OBJECT", required: ["level", "answer", "sources"], properties: {
  level: { type: "STRING", enum: GRAVIDADE }, answer: { type: "STRING" }, sources: { type: "ARRAY", items: { type: "INTEGER" } } } };

function adicionar(classe, html) {
  $("inicio").hidden = true;
  const div = document.createElement("div");
  div.className = classe;
  div.innerHTML = html;
  $("conversa").append(div);
  $("rolagem").scrollTop = $("rolagem").scrollHeight;
  return div;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function pedirChave(msg, erro) {
  const div = adicionar("bot erro", `<p>${erro ? `O Google recusou a chave: ${esc(erro)}` : "Para responder, o chat precisa de uma chave da API do Gemini."}
    Crie uma gratuita no <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> e cole aqui.</p>
    <form class="caixa-chave"><input type="password" placeholder="AIza…" aria-label="Chave da API do Gemini" autocomplete="off" required>
    <button class="botao escuro">Salvar e responder</button></form>`);
  div.querySelector("input").focus();
  div.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    sessionStorage.setItem("chave", div.querySelector("input").value.trim());
    marcarChave();
    div.remove();
    enviar(msg, true);
  });
}

async function enviar(msg, repetir = false) {
  if (!repetir) adicionar("usuario", esc(msg));
  if (!sessionStorage.getItem("chave")) return pedirChave(msg);
  const resp = adicionar("bot", '<p class="pensando" aria-label="Processando"><span></span><span></span><span></span></p>');
  try {
    const en = (await gemini(`Translate this message about a health symptom to plain English. If it is already in English, return it unchanged.\n\n${msg}`,
      { type: "OBJECT", required: ["en"], properties: { en: { type: "STRING" } } })).en;
    const probs = classificar(en);
    const nivelModelo = GRAVIDADE.reduce((a, b) => (probs[b] > probs[a] ? b : a));
    const trechos = buscar(en);
    const r = await gemini(PROMPT_RESPOSTA(msg, nivelModelo, trechos), ESQUEMA_RESPOSTA);
    const nivelGemini = r.level;
    const nivel = GRAVIDADE.indexOf(r.level) > GRAVIDADE.indexOf(nivelModelo) ? r.level : nivelModelo;
    const texto = `<p>${esc(r.answer)}</p>`;
    const fontes = r.sources.map((i) => trechos[i - 1]).filter(Boolean);
    resp.innerHTML = `<span class="nivel ${nivel}">${NOMES[nivel]}${nivel === "emergency" ? " · ligue 192 (SAMU) ou vá ao pronto-socorro" : ""}</span>
      ${texto}
      <div class="fontes">${fontes.filter((t, i) => fontes.findIndex((u) => u.pagina === t.pagina) === i).map((t) => `<a href="${t.url}" target="_blank" rel="noopener">${esc(t.pagina)}</a>`).join("")}</div>
      <details><summary>O que o modelo fez</summary>
        <p>Texto em inglês: <i>${esc(en)}</i></p>
        <p>Classificador (TF-IDF + Regressão Logística): ${GRAVIDADE.slice().reverse().map((c) => `${NOMES[c]} ${(probs[c] * 100).toFixed(0)}%`).join(" · ")}</p>
        <p>Gemini: ${NOMES[nivelGemini]}. O nível mostrado é o mais grave dos dois.</p>
        <p>Trechos recuperados (cosseno · nível no NHS · página):</p>
        <ol>${trechos.map((t) => `<li>${t.sim.toFixed(2)} · ${NOMES[t.nivel]} · ${esc(t.pagina)}: ${esc(t.texto.slice(0, 160))}…</li>`).join("")}</ol>
      </details>`;
  } catch (e) {
    if (/api key/i.test(e.message)) {
      resp.remove();
      sessionStorage.removeItem("chave");
      marcarChave();
      return pedirChave(msg, e.message);
    }
    resp.textContent = "Erro: " + e.message;
  }
  $("rolagem").scrollTop = $("rolagem").scrollHeight;
}

async function iniciar() {
  [modelo, docs] = await Promise.all(["modelo.json", "trechos.json"].map((a) => fetch(a).then((r) => r.json())));
  stop = new Set(modelo.stopwords);
  vocab = new Map(modelo.vocab.map((t, i) => [t, i]));
  const toks = docs.map((d) => tokens(d[3])), indice = new Map(), df = [];
  for (const ts of toks) for (const t of new Set(ts)) {
    if (!indice.has(t)) { indice.set(t, df.length); df.push(0); }
    df[indice.get(t)]++;
  }
  idfDocs = { indice, idf: df.map((n) => Math.log((1 + docs.length) / (1 + n)) + 1) };
  vetDocs = toks.map((ts) => tfidf(ts, indice, idfDocs.idf));
  $("enviar").disabled = false;
  $("mensagem").placeholder = "Descreva o sintoma";
}

if (sessionStorage.getItem("aceite") !== "1") $("aviso").showModal();
$("aviso").addEventListener("cancel", (e) => e.preventDefault());
$("aceite").addEventListener("change", (e) => { $("comecar").disabled = !e.target.checked; });
$("comecar").addEventListener("click", () => { sessionStorage.setItem("aceite", "1"); $("aviso").close(); $("mensagem").focus(); });

const marcarChave = () => $("ponto").classList.toggle("on", !!sessionStorage.getItem("chave"));
$("abrir-chave").addEventListener("click", () => { $("chave").value = sessionStorage.getItem("chave") || ""; $("dlg-chave").showModal(); });
$("salvar-chave").addEventListener("click", () => {
  const v = $("chave").value.trim();
  v ? sessionStorage.setItem("chave", v) : sessionStorage.removeItem("chave");
  marcarChave(); $("dlg-chave").close();
});
$("remover-chave").addEventListener("click", () => { sessionStorage.removeItem("chave"); marcarChave(); $("dlg-chave").close(); });
marcarChave();

function submeter() {
  const msg = $("mensagem").value.trim();
  if (!msg || $("enviar").disabled) return;
  $("mensagem").value = ""; $("mensagem").style.height = "";
  enviar(msg);
}
$("form").addEventListener("submit", (e) => { e.preventDefault(); submeter(); });
$("mensagem").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submeter(); } });
$("mensagem").addEventListener("input", (e) => { e.target.style.height = ""; e.target.style.height = e.target.scrollHeight + "px"; });
document.querySelectorAll(".sugestao").forEach((b) => b.addEventListener("click", () => { if (!$("enviar").disabled) enviar(b.textContent); }));
iniciar();
