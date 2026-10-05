import itRaw from './locales/it.json'
import enRaw from './locales/en.json'
import { Locale, TelegramLocale, Status } from "./types"


const it: Locale = itRaw satisfies Locale
const en: Locale = enRaw satisfies Locale

const LOCALES: Record<string, Locale> = { it, en }

export const DEFAULT_LANG = 'it'

function getLocale(lang: string): Locale {
    return LOCALES[lang] ?? LOCALES[DEFAULT_LANG]
}

export function buildNotificationMessage(status: Status, lang: string): string {
    const locale = getLocale(lang)
    return status === Status.Up ? locale.status_up : locale.status_down
}

export function getTelegramLocale(lang: string): TelegramLocale {
    return getLocale(lang).telegram
}