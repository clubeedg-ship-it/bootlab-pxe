"""Language-to-locale mapping for Windows unattended setup."""

LOCALES: dict[str, dict] = {
    "nl-NL": {
        "timezone": "W. Europe Standard Time",
        "geo_id": 176,
        "input_method": "0413:00020409",
        "username": "Gebruiker",
        "keyboard_name": "Dutch QWERTY",
    },
    "fr-FR": {
        "timezone": "Romance Standard Time",
        "geo_id": 84,
        "input_method": "040C:0000040C",
        "username": "Utilisateur",
        "keyboard_name": "French AZERTY",
    },
    "de-DE": {
        "timezone": "W. Europe Standard Time",
        "geo_id": 94,
        "input_method": "0407:00000407",
        "username": "Benutzer",
        "keyboard_name": "German QWERTZ",
    },
    "it-IT": {
        "timezone": "W. Europe Standard Time",
        "geo_id": 118,
        "input_method": "0410:00000410",
        "username": "Utente",
        "keyboard_name": "Italian",
    },
    "en-US": {
        "timezone": "Eastern Standard Time",
        "geo_id": 244,
        "input_method": "0409:00000409",
        "username": "User",
        "keyboard_name": "US QWERTY",
    },
}


def get_locale(lang: str) -> dict:
    """Return locale dict for the given BCP-47 language tag.

    Raises ValueError if the language is not supported.
    """
    try:
        return LOCALES[lang]
    except KeyError:
        supported = ", ".join(sorted(LOCALES))
        raise ValueError(
            f"Unsupported language '{lang}'. Supported: {supported}"
        )
