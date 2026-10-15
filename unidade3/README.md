# Unidade 3: representações e tarefas de PLN
Trabalho da Unidade 3 de Processamento de Linguagem Natural
Equipe: Guilherme Moll.

Mesmo corpus da Etapa Prática 1 (`../data/passages.jsonl.gz`).

## Arquivos

| | |
|---|---|
| `unidade3.ipynb` | o trabalho: representações, clusters, busca, classificação, sentimento, NER e relações, com as saídas |
| `PLN 2026_2 - Trabalho Unidade 3 - Guilherme Moll.docx` | respostas do trabalho |
| `figuras/` | figuras geradas pelo notebook |

## Rodar

```bash
python -m venv .venv && .venv/Scripts/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
jupyter notebook unidade3.ipynb
