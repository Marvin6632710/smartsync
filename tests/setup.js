// Initialises i18next with the bundled resources before any test runs, so
// components render their English strings rather than translation keys.
// Tests that exercise another language switch with `i18n.changeLanguage`.
import i18n from '../src/i18n'

if (i18n.language !== 'en') await i18n.changeLanguage('en')
