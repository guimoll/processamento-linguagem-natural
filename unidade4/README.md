# Unidade 4: triagem de sintomas com LLM e RAG
Trabalho da Unidade 4 (Mostra Virtual de PLN), modalidade B, aplicação web
Equipe: Guilherme Moll.

**Página:** https://guimoll.github.io/processamento-linguagem-natural/unidade4/

Chat em que o usuário descreve um sintoma e recebe o nível de urgência e os trechos do NHS que tratam do assunto. O classificador TF-IDF + Regressão Logística da Unidade 3 e a busca rodam no navegador. Com a chave do Gemini do próprio usuário, o LLM traduz a mensagem e escreve a resposta a partir dos trechos recuperados (RAG). Antes de usar, o usuário confirma que isto não é aconselhamento médico.

Mesmo corpus das etapas anteriores (`../data/passages.jsonl.gz`).

## Arquivos

| | |
|---|---|
| `unidade4.ipynb` | treina e exporta o classificador e compara Regressão Logística, Gemini sem exemplos e Gemini + RAG, com as saídas |
| `index.html`, `app.js` | o chat, sem bibliotecas e sem servidor |
| `sobre.html` | a página com problema, metodologia, resultados, avaliação e limitações |
| `modelo.json` | vocabulário, IDF e pesos da Regressão Logística, gerados pelo notebook |
| `trechos.json` | as 18 mil passagens sem duplicata usadas pela busca, geradas pelo notebook |
| `cache_gemini.json` | respostas do Gemini usadas no notebook, para rodar de novo sem chave |
| `matrizes_unidade4.png` | matrizes de confusão do teste |
| `uso_de_ia.txt` | uso de IA generativa |

## Técnicas da Unidade 4

| Tecnologia ou abordagem | Usada? | Aplicação ou justificativa |
|---|---|---|
| LLMs e modelos de linguagem | Sim | Gemini (`gemini-3.5-flash-lite`, API) traduz a mensagem, classifica e escreve a resposta |
| Prompt engineering e saídas estruturadas | Sim | Prompt com a definição dos 4 níveis do NHS e esquema JSON nas duas chamadas |
| RAG e recuperação de informações | Sim | Busca TF-IDF nas 18 mil passagens, os 5 trechos mais próximos vão no prompt e a resposta cita as páginas |
| Agentes e integração com ferramentas | Não | O fluxo é fixo, sem decisão sobre qual ferramenta chamar |
| Modelos locais ou quantizados | Não | O classificador roda no navegador, mas não é um modelo de linguagem |
| Processamento multimodal | Não | O corpus é só texto |
| Outras técnicas avançadas | Não | |

Resultados, avaliação e limitações estão na página e no notebook.

## Tecnologias

Python com scikit-learn, NLTK (stopwords), pandas e matplotlib. Google Gemini `gemini-3.5-flash-lite` pela API REST, temperatura 0, saída JSON com `responseSchema`. Site em HTML e JavaScript puros, no GitHub Pages.

## Rodar

Notebook, com as chamadas ao Gemini lidas do `cache_gemini.json` (para chamar de novo, defina `GEMINI_API_KEY`):

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
jupyter notebook unidade4.ipynb
```

Site local, por HTTP:

```bash
python -m http.server 8000
# http://localhost:8000/
```
