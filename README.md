# NHS.UK Health A-Z: corpus de texto para triagem
Etapa Prática 1 de Processamento de Linguagem Natural
Equipe: Guilherme Moll.

Coleta e preparação de um corpus do [NHS.UK Health A to
Z](https://www.nhs.uk/health-a-to-z/)



## Arquivos

| | |
|---|---|
| `nhs_health_a_to_z.ipynb` | o trabalho: coleta, limpeza e pré-processamento, com as saídas |
| `extract.py` | extração de HTML para registros, longa demais para caber no notebook |
| `data/passages.jsonl.gz` | o corpus, 3,7 MB |
| `DATA_DICTIONARY.md` | cada campo, seus valores e os limites da base |

## Rodar

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
jupyter notebook nhs_health_a_to_z.ipynb
```

