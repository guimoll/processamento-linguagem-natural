# Dicionário de dados



| | |
|---|---|
| Arquivo | `data/passages.jsonl.gz` (JSON Lines comprimido, 3,7 MB) |
| Registros | 24.159 passagens, de 3.530 páginas |
| Texto | 12.419.942 caracteres |
| Idioma | inglês britânico |
| Origem | `https://www.nhs.uk/` e as nove subseções do Health A-Z |

Ler o arquivo:

```python
import gzip, json
with gzip.open("data/passages.jsonl.gz", "rt", encoding="utf-8") as fh:
    passages = [json.loads(line) for line in fh]
```

---

## Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `passage_id` | string | Identificador único. Formato `<page_id>#<tópico>-<elemento>`, ex. `baby#01-00`. |
| `page_id` | string | Página de origem, derivada do caminho da URL. Junta com `passage_id`. |
| `url` | string | URL de origem, com âncora quando o tópico tem uma. É o que se cita ao exibir a passagem. |
| `page_name` | string | Título da página, como o publicador o declara. |
| `genre` | string | Tipo de página atribuído pelo publicador: `Condition`, `Medicine`, `Symptom`, `Treatment`, `Test`, `Vaccine`, `Contraception`, `Accident or injury`, `Advice or information`. **Vazio em 28%** das passagens. |
| `section` | string | Primeira parte do caminho. Uma das nove subseções (ver abaixo). |
| `health_aspect` | string | Health aspect do schema.org, ex. `SymptomsHealthAspect`, `CausesHealthAspect`. **Vazio em 21%**: são as passagens vindas do DOM, cujas páginas não declaram aspecto. |
| `topic_headline` | string | Título do bloco a que a passagem pertence. Vazio em 27%. |
| `passage_headline` | string | Título da própria passagem, quando existe. Vazio em 53%. |
| `urgency` | string | **O rótulo de triagem.** Um de cinco valores (ver abaixo). |
| `care_card` | string \| null | O `identifier` do care card que originou o rótulo: `immediate`, `urgent` ou `primary`. **`null` em 92%**, quando a passagem não é um care card. |
| `extraction_method` | string | `json_ld` ou `html_fallback`. Qual rota produziu o registro. |
| `raw_text` | string | O texto como veio da página. Nada rio abaixo o sobrescreve. |

---

## Valores

### `urgency`

O campo que dá valor a este corpus. O rótulo vem da própria organização que
escreveu o texto, e não de anotação manual.

| Valor | Origem | Passagens |
|---|---|---|
| `emergency` | care card `immediate`, "Call 999 if:" | 628 |
| `urgent` | care card `urgent`, "Ask for an urgent GP appointment if:" | 720 |
| `non_urgent` | care card `primary`, "See a GP if:" | 716 |
| `self_care` | `SelfCareHealthAspect` | 1.036 |
| `informational` | prosa descritiva, sem marcação de urgência | 21.059 |

### `section`

| Subseção | Passagens | | Subseção | Passagens |
|---|---:|---|---|---:|
| `conditions` | 9.934 | | `pregnancy` | 682 |
| `medicines` | 8.153 | | `baby` | 612 |
| `tests-and-treatments` | 1.859 | | `contraception` | 594 |
| `mental-health` | 1.058 | | `vaccinations` | 353 |
| `symptoms` | 914 | | **Total** | **24.159** |

### `extraction_method`

| Valor | Passagens | O que significa |
|---|---:|---|
| `json_ld` | 19.167 | A página declara `hasPart`, e as partes foram usadas. |
| `html_fallback` | 4.992 | A página é `WebPage` com `hasPart` vazio; o texto veio do DOM. |

---

## Colunas derivadas

Não estão no arquivo. O notebook as produz, na ordem, e nenhuma sobrescreve a
anterior.

| Coluna | Vem de | Como |
|---|---|---|
| `clean_text` | `raw_text` | NFKC, aspas tipográficas retificadas, tags e entidades residuais removidas, URLs removidas, espaços colapsados. **Caixa, pontuação e stopwords sobrevivem de propósito**: são decisões da tarefa. |
| `tokens` | `clean_text` | `word_tokenize(language="english")`. A pontuação vira token próprio nesta etapa. |
| `tokens_normalized` | `tokens` | Minúsculas e `isalpha()`. **Derruba numerais**, então `999` e `111` não sobrevivem. |
| `tokens_no_stopwords` | `tokens_normalized` | Stopwords do NLTK removidas, **exceto ~47 palavras de negação e modalidade**. Num corpus de triagem, "cannot breathe" e "breathe" não podem colapsar. |
| `lemmas` | `tokens_no_stopwords` | spaCy `en_core_web_sm`. Formas legíveis; prefira para o que for exibido ao usuário. |
| `stems` | `tokens_no_stopwords` | `SnowballStemmer("english")`. Mais agressivo e mais barato; serve a um índice lexical. |

`lemmas` e `stems` são **ramos alternativos** do mesmo conjunto filtrado, não
etapas encadeadas.

---
