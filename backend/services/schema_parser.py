"""
Schema parsing, depends_on evaluation, and cell validation.
"""

import re
from datetime import datetime
from typing import Any, Optional


# ---------------------------------------------------------------------------
# parse_data_type
# ---------------------------------------------------------------------------

def parse_data_type(data_type: str) -> dict:
    """
    Parse a schema data-type string into a structured dict.

    Supported patterns (case-insensitive):
      Text (n)                  -> type=text,     max_length=n
      Number (a,b)              -> type=number,   min=a, max=b
      Multiple (a,b,c,...)      -> type=multiple, options=[a,b,c,...]
      List (a,b,c,...)          -> type=list,     options=[a,b,c,...]
      Date (DD/MM/YYYY)         -> type=date
      Date (DD/MM/YYYY HH:MM:SS)-> type=datetime

    Returns:
      {
        "type": str,
        "max_length": int | None,
        "min": float | None,
        "max": float | None,
        "options": list | None,
      }
    """
    result = {
        "type": "text",
        "max_length": None,
        "min": None,
        "max": None,
        "options": None,
    }

    if not data_type:
        return result

    s = data_type.strip()

    # Date / Datetime — must come before generic Text check
    date_match = re.match(
        r"^Date\s*\(\s*DD/MM/YYYY(\s+HH:MM:SS)?\s*\)$", s, re.IGNORECASE
    )
    if date_match:
        result["type"] = "datetime" if date_match.group(1) else "date"
        return result

    # Text (n)
    text_match = re.match(r"^Text\s*\(\s*(\d+)\s*\)$", s, re.IGNORECASE)
    if text_match:
        result["type"] = "text"
        result["max_length"] = int(text_match.group(1))
        return result

    # Number (a,b)
    number_match = re.match(
        r"^Number\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$", s, re.IGNORECASE
    )
    if number_match:
        result["type"] = "number"
        result["min"] = float(number_match.group(1))
        result["max"] = float(number_match.group(2))
        return result

    # Multiple (a,b,c,...)
    multiple_match = re.match(r"^Multiple\s*\((.+)\)$", s, re.IGNORECASE)
    if multiple_match:
        options = [o.strip() for o in multiple_match.group(1).split(",")]
        result["type"] = "multiple"
        result["options"] = options
        return result

    # List (a,b,c,...)
    list_match = re.match(r"^List\s*\((.+)\)$", s, re.IGNORECASE)
    if list_match:
        options = [o.strip() for o in list_match.group(1).split(",")]
        result["type"] = "list"
        result["options"] = options
        return result

    # Fallback — treat as plain text
    result["type"] = "text"
    return result


# ---------------------------------------------------------------------------
# parse_depends_on
# ---------------------------------------------------------------------------

def parse_depends_on(depends_on: str) -> list[dict]:
    """
    Parse a depends_on expression into a list of condition dicts.

    Supported format (one condition per line or semicolon-separated):
      FieldName = val1 or val2 or val3
      FieldName = val

    Returns:
      [{"field": str, "values": list[str]}, ...]
    """
    if not depends_on or not depends_on.strip():
        return []

    # Split on newlines or semicolons
    raw_conditions = re.split(r"[\n;]+", depends_on)
    conditions = []
    for raw in raw_conditions:
        raw = raw.strip()
        if not raw:
            continue
        # Expect:  FieldName = value1 or value2
        eq_match = re.match(r"^(.+?)\s*=\s*(.+)$", raw)
        if not eq_match:
            continue
        field = eq_match.group(1).strip()
        values_str = eq_match.group(2).strip()
        values = [v.strip() for v in re.split(r"\bor\b", values_str, flags=re.IGNORECASE)]
        values = [v for v in values if v]
        if field and values:
            conditions.append({"field": field, "values": values})

    return conditions


# ---------------------------------------------------------------------------
# check_depends_on
# ---------------------------------------------------------------------------

def check_depends_on(depends_on_rules: list[dict], record_data: dict) -> bool:
    """
    Return True if ANY condition in depends_on_rules is satisfied.

    A condition is satisfied when the record_data contains the field and
    the field's current value (as a string, case-insensitive) matches at
    least one of the listed values.
    """
    if not depends_on_rules:
        return True  # no conditions → always active

    for rule in depends_on_rules:
        field = rule.get("field")
        allowed_values = [str(v).lower() for v in rule.get("values", [])]
        if field not in record_data:
            continue
        current = record_data.get(field)
        if current is None:
            continue
        if str(current).lower() in allowed_values:
            return True

    return False


# ---------------------------------------------------------------------------
# validate_cell
# ---------------------------------------------------------------------------

def validate_cell(
    value: Any,
    schema_def,  # SchemaDefinition ORM object or dict-like with same attrs
    all_record_data: dict,
) -> Optional[str]:
    """
    Validate a single cell value against its schema definition.

    Returns an error message string on failure, or None on success.
    """
    # Resolve schema attributes (supports both ORM objects and plain dicts)
    def _get(attr, default=None):
        if isinstance(schema_def, dict):
            return schema_def.get(attr, default)
        return getattr(schema_def, attr, default)

    field_name = _get("field_name", "")
    data_type_str = _get("data_type", "")
    accept_null = _get("accept_null", True)
    depends_on_str = _get("depends_on", None)

    # Evaluate depends_on first — if condition not met, field is not required
    depends_on_rules = parse_depends_on(depends_on_str or "")
    condition_active = True
    if depends_on_rules:
        condition_active = check_depends_on(depends_on_rules, all_record_data)
        if not condition_active:
            # Field is inactive; any value (including null) is acceptable
            return None

    # Null check
    is_null = value is None or (isinstance(value, str) and value.strip() == "")
    if is_null:
        if not accept_null or (depends_on_rules and condition_active):
            # Build a context-aware message when a depends_on rule is the reason
            if depends_on_rules and condition_active:
                rule = depends_on_rules[0]
                dep_field = rule["field"]
                dep_vals = " or ".join(f'"{v}"' for v in rule["values"])
                return (
                    f"'{field_name}' is required because '{dep_field}' is set to {dep_vals}. "
                    f"Please fill in this field."
                )
            return f"'{field_name}' is required and cannot be left blank."
        return None  # null is explicitly allowed

    parsed = parse_data_type(data_type_str)
    dtype = parsed["type"]

    if dtype == "text":
        str_val = str(value)
        max_len = parsed.get("max_length")
        if max_len is not None and len(str_val) > max_len:
            over = len(str_val) - max_len
            return (
                f"'{field_name}' is {len(str_val)} characters long, but the maximum allowed "
                f"is {max_len}. Please shorten it by {over} character(s)."
            )

    elif dtype == "number":
        try:
            num_val = float(value)
        except (TypeError, ValueError):
            return (
                f"'{field_name}' must be a number (e.g. 42 or 3.14). "
                f"'{value}' is not a valid number — remove any letters, currency symbols, or commas."
            )
        min_val = parsed.get("min")
        max_val = parsed.get("max")
        if min_val is not None and max_val is not None and (num_val < min_val or num_val > max_val):
            return (
                f"'{field_name}' must be between {int(min_val) if min_val == int(min_val) else min_val} "
                f"and {int(max_val) if max_val == int(max_val) else max_val} "
                f"(got {int(num_val) if num_val == int(num_val) else num_val})."
            )
        elif min_val is not None and num_val < min_val:
            return (
                f"'{field_name}' must be at least "
                f"{int(min_val) if min_val == int(min_val) else min_val} "
                f"(got {int(num_val) if num_val == int(num_val) else num_val})."
            )
        elif max_val is not None and num_val > max_val:
            return (
                f"'{field_name}' must be at most "
                f"{int(max_val) if max_val == int(max_val) else max_val} "
                f"(got {int(num_val) if num_val == int(num_val) else num_val})."
            )

    elif dtype in ("multiple", "list"):
        options = parsed.get("options") or []
        options_lower = [o.lower() for o in options]
        if dtype == "multiple":
            # value may be a list or a comma-separated string
            if isinstance(value, list):
                selections = value
            else:
                selections = [v.strip() for v in str(value).split(",")]
            invalid = [s for s in selections if s.strip() and s.lower() not in options_lower]
            if invalid:
                bad = ", ".join(f"'{s}'" for s in invalid)
                return (
                    f"'{field_name}' contains unrecognised value(s): {bad}. "
                    f"Allowed options are: {', '.join(options)}."
                )
        else:  # list — single selection
            if str(value).lower() not in options_lower:
                return (
                    f"'{field_name}': '{value}' is not a valid choice. "
                    f"Select one of: {', '.join(options)}."
                )

    elif dtype == "date":
        # Accept ISO 8601 (YYYY-MM-DD) or DD/MM/YYYY
        str_val = str(value).strip()
        parsed_ok = False
        for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
            try:
                datetime.strptime(str_val, fmt)
                parsed_ok = True
                break
            except ValueError:
                pass
        if not parsed_ok:
            return (
                f"'{field_name}': '{value}' is not a valid date. "
                f"Use DD/MM/YYYY format (e.g. 31/12/2024)."
            )

    elif dtype == "datetime":
        str_val = str(value).strip()
        parsed_ok = False
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ):
            try:
                datetime.strptime(str_val, fmt)
                parsed_ok = True
                break
            except ValueError:
                pass
        if not parsed_ok:
            return (
                f"'{field_name}': '{value}' is not a valid date and time. "
                f"Use DD/MM/YYYY HH:MM:SS format (e.g. 31/12/2024 14:30:00)."
            )

    return None
