from .awesomecv import (
	DEFAULT_TEMPLATE_ID,
	map_canonical_to_template,
	map_canonical_to_template_deterministic,
)

DETERMINISTIC_MAPPERS = {
	DEFAULT_TEMPLATE_ID: map_canonical_to_template_deterministic,
}

LLM_MAPPERS = {
	DEFAULT_TEMPLATE_ID: map_canonical_to_template,
}


def get_deterministic_mapper(template_id: str):
	return DETERMINISTIC_MAPPERS.get(template_id)


def get_llm_mapper(template_id: str):
	return LLM_MAPPERS.get(template_id)
