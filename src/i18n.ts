import itRaw from './locales/it.json';
import enRaw from './locales/en.json';
import { Status } from "./Status";

export interface Locale {
    status_up: string;
    status_down: string;
}

const it: Locale = itRaw satisfies Locale;
const en: Locale = enRaw satisfies Locale;

const LOCALES: Record<string, Locale> = { it, en };

export function parseLang(rawEnvVal: string | undefined): string {
    return rawEnvVal && LOCALES[rawEnvVal] ? rawEnvVal : 'it';
}

export function buildNotificationMessage(status: Status, lang: string): string {
    const locale = LOCALES[lang] ?? LOCALES['it'];
    return status === Status.Up ? locale.status_up : locale.status_down;
}