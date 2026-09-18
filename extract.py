from __future__ import annotations

import json
import re
from typing import Any, Iterator

from bs4 import BeautifulSoup


# O `identifier` do care card e a taxonomia de triagem da Unidade 1.
CARE_CARD_URGENCY = {
    "immediate": "emergency",     # "Call 999 if:"
    "urgent": "urgent",           # "Ask for an urgent GP appointment if:"
    "primary": "non_urgent",      # "See a GP if:"
}
# Sem care card, o health aspect decide.
ASPECT_URGENCY = {
    "MedicalHelpEmergencyHealthAspect": "emergency",
    "MedicalHelpUrgentHealthAspect": "urgent",
    "MedicalHelpNonurgentHealthAspect": "non_urgent",
    "SelfCareHealthAspect": "self_care",
}

_JSON_LD = re.compile(
    r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', re.DOTALL
)

PAGE_TYPES = ("MedicalWebPage", "WebPage")

EXTRACTION_JSON_LD = "json_ld"
EXTRACTION_HTML = "html_fallback"

# Care-card modifier classes, and the triage level each one denotes. These are
# the DOM counterpart of the JSON-LD `identifier` values above.
_CARE_CARD_CLASSES = {
    "nhsuk-card--care--emergency": ("immediate", "emergency"),
    "nhsuk-card--care--urgent": ("urgent", "urgent"),
    "nhsuk-card--care--non-urgent": ("primary", "non_urgent"),
}

# Blocks that are page furniture rather than health content.
_NAVIGATION_CLASSES = (
    "beta-hub-sibling-nav",
    "beta-nhsuk-navigation-sideways",
    "nhsuk-pagination",
    "nhsuk-breadcrumb",
    "nhsuk-contents-list",
)

_MEDIA_HEADLINE = re.compile(r"^\s*video\s*:", re.IGNORECASE)

# Longest observed contents-menu label is 52 characters; the shortest
# genuine Overview prose carrying a headline is over 60. See is_contents_link.
CONTENTS_LABEL_MAX_CHARS = 60


class NoStructuredData(ValueError):
    """The page carries no recognised schema.org block."""


def _aspect_name(aspect: str) -> str:
    """`http://schema.org/SymptomsHealthAspect` -> `SymptomsHealthAspect`."""
    return aspect.rsplit("/", 1)[-1] if aspect else ""


def html_to_text(fragment: str) -> str:
    """Flatten a stored HTML fragment to readable text.

    List items become their own lines so that a care card's bullet points stay
    separable later; block boundaries become newlines so sentence splitting
    does not run two paragraphs together.
    """
    if not fragment:
        return ""
    return _soup_to_text(BeautifulSoup(fragment, "lxml"))


def _soup_to_text(soup) -> str:
    for item in soup.find_all("li"):
        item.insert_before("\n")
        item.insert_after("\n")
    for block in soup.find_all(["p", "div", "section", "h1", "h2", "h3", "h4", "br", "tr"]):
        block.insert_after("\n")
    text = soup.get_text()
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{2,}", "\n", text).strip()


def find_structured_document(html: str) -> dict[str, Any]:
    """The first JSON-LD block typed MedicalWebPage or WebPage.

    Pages also embed VideoObject blocks; those are skipped. MedicalWebPage is
    preferred when both are present, because it is the one that carries
    `hasPart`.
    """
    candidates = []
    for block in _JSON_LD.findall(html):
        try:
            document = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(document, dict) and document.get("@type") in PAGE_TYPES:
            candidates.append(document)
    if not candidates:
        raise NoStructuredData("no MedicalWebPage or WebPage JSON-LD block on this page")
    candidates.sort(key=lambda document: document["@type"] != "MedicalWebPage")
    return candidates[0]


def _breadcrumb(document: dict[str, Any]) -> list[str]:
    crumb = document.get("breadcrumb") or {}
    items = crumb.get("itemListElement") or []
    return [
        item.get("item", {}).get("name", "") for item in items if isinstance(item, dict)
    ]


def _urgency(care_card: str | None, aspect: str) -> str:
    """Triage level for a passage.

    """
    if care_card and care_card in CARE_CARD_URGENCY:
        return CARE_CARD_URGENCY[care_card]
    return ASPECT_URGENCY.get(aspect, "informational")


def page_record(document, page_id, url, section):
    """Metadados da pagina, lidos do bloco schema.org."""
    reviewed = document.get("lastReviewed") or []
    if isinstance(reviewed, str):
        reviewed = [reviewed]
    genres = document.get("genre") or []

    return {
        "page_id": page_id,
        "url": url,
        "section": section,
        "page_type": document.get("@type", ""),
        "genre": genres[0] if genres else "",
        "name": document.get("name", ""),
        "description": document.get("description", ""),
        "last_reviewed": reviewed[0] if reviewed else None,
        "review_due": reviewed[1] if len(reviewed) > 1 else None,
        "license": document.get("license"),
    }


def _passage(
    page: dict[str, Any],
    index: str,
    url: str,
    aspect: str,
    topic_headline: str,
    topic_description: str,
    passage_headline: str,
    care_card: str | None,
    urgency: str,
    raw_text: str,
    position: int,
    method: str,
) -> dict[str, Any]:
    return {
        "passage_id": f"{page['page_id']}#{index}",
        "page_id": page["page_id"],
        "url": url,
        "page_name": page["name"],
        "genre": page["genre"],
        "section": page["section"],
        "health_aspect": aspect,
        "topic_headline": topic_headline,
        "passage_headline": passage_headline,
        "urgency": urgency,
        "care_card": care_card,
        "extraction_method": method,
        # `raw_text` e a evidencia. Nada rio abaixo o sobrescreve.
        "raw_text": raw_text,
    }


def is_contents_link(aspect: str, headline: str | None, raw_text: str) -> bool:
    if aspect != "OverviewHealthAspect":
        return False
    if not (headline or "").strip():
        return False
    return "\n" not in raw_text and 0 < len(raw_text) <= CONTENTS_LABEL_MAX_CHARS


def passages_from_json_ld(
    document: dict[str, Any], page: dict[str, Any]
) -> Iterator[dict[str, Any]]:
    """One record per WebPageElement inside each HealthTopicContent."""
    for topic_index, topic in enumerate(document.get("hasPart") or []):
        if not isinstance(topic, dict):
            continue
        aspect = _aspect_name(topic.get("hasHealthAspect", ""))

        for element_index, element in enumerate(topic.get("hasPart") or []):
            if not isinstance(element, dict):
                continue
            raw_text = html_to_text(element.get("text") or "")
            if not raw_text:
                continue
            if is_contents_link(aspect, element.get("headline"), raw_text):
                continue
            care_card = element.get("identifier")
            yield _passage(
                page=page,
                index=f"{topic_index:02d}-{element_index:02d}",
                url=topic.get("url") or page["url"],
                aspect=aspect,
                topic_headline=topic.get("headline", ""),
                topic_description=topic.get("description", ""),
                passage_headline=element.get("headline") or "",
                care_card=care_card,
                urgency=_urgency(care_card, aspect),
                raw_text=raw_text,
                position=topic_index * 100 + element_index,
                method=EXTRACTION_JSON_LD,
            )


def _care_card_of(node) -> tuple[str | None, str]:
    """Read the triage level a `<section>` carries, from its card modifier."""
    for card in node.select(".nhsuk-card--care"):
        for class_name in card.get("class") or []:
            if class_name in _CARE_CARD_CLASSES:
                return _CARE_CARD_CLASSES[class_name]
    return None, "informational"


def passages_from_html(html: str, page: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Fallback for pages whose JSON-LD declares no parts.

    """
    soup = BeautifulSoup(html, "lxml")
    main = soup.find("main") or soup
    for unwanted in main.find_all(class_=_NAVIGATION_CLASSES):
        unwanted.decompose()

    sections = main.select(".nhsuk-grid-column-two-thirds section") or main.find_all("section")
    for index, node in enumerate(sections):
        heading = node.find(["h2", "h3"]) or node.select_one(".nhsuk-card__heading")
        headline = heading.get_text(" ", strip=True) if heading else ""
        care_card, urgency = _care_card_of(node)


        if heading is not None:
            heading.decompose()
        raw_text = _soup_to_text(node)
        if not raw_text:
            continue
        yield _passage(
            page=page,
            index=f"html-{index:02d}",
            url=page["url"],
            aspect="",
            topic_headline=headline,
            topic_description="",
            passage_headline=headline,
            care_card=care_card,
            urgency=urgency,
            raw_text=raw_text,
            position=index,
            method=EXTRACTION_HTML,
        )


def extract(html, page_id, url, section):
    """HTML -> (registro da pagina, lista de passagens)."""
    document = find_structured_document(html)
    page = page_record(document, page_id, url, section)

    passages = list(passages_from_json_ld(document, page))
    if not passages:
        passages = list(passages_from_html(html, page))

    page["extraction_method"] = (
        passages[0]["extraction_method"] if passages else "none"
    )
    page["n_passages"] = len(passages)
    page["total_char_count"] = sum(len(item["raw_text"]) for item in passages)
    return page, passages
