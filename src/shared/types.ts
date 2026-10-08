export enum Status {
    Up = 'OK',
    Down = 'KO',
}

export type Lang = 'it' | 'en'

export interface TelegramLocale {
    last_seen: string
    current_status: string
    no_detection: string
    command_message: string
}

export interface Locale {
    status_up: string
    status_down: string
    telegram: TelegramLocale
}

export type LocaleConfig = {
    locale: string;
    timeZone: string;
};

export const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
    it: {
        locale: 'it-IT',
        timeZone: 'Europe/Rome',
    },
    en: {
        locale: 'en-US',
        timeZone: 'UTC',
    },
};

export function getLocaleConfig(lang: string): LocaleConfig {
    return LOCALE_CONFIGS[lang] ?? LOCALE_CONFIGS['it'];
}


export interface Env {
    SERVER_STATUS: KVNamespace
    APP_TOKEN: string
    TELEGRAM_BOT_TOKEN: string
    TELEGRAM_CHAT_ID: string
    LAST_SEEN_WINDOW_MINUTES?: string
    NOTIFICATION_LANGUAGE?: string
}

export type Heartbeat = {
    last_seen: number
};

export type NotificationState = {
    notification_status: Status | null
    notification_last_send: number | null
};

export type ServiceStatus = Heartbeat | NotificationState

export interface TelegramBodyMessage {
    update_id: number
    message: Message
}

export interface Chat {
    id: number,
    first_name?: string,
    last_name?: string,
    username?: string,
    type: "private" | "group" | "supergroup" | "channel"
}

export interface User {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
}

export interface Message {
    message_id: number
    from?: User
    chat: Chat
    date: number
    text?: string;
}