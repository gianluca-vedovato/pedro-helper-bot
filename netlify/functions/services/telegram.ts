import { Telegraf } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";

const BOT_TOKEN = process.env.BOT_TOKEN;

let telegram: Telegraf["telegram"] | null = null;

function ensureTelegram() {
  if (!telegram) {
    if (!BOT_TOKEN) {
      throw new Error("Missing BOT_TOKEN");
    }
    telegram = new Telegraf(BOT_TOKEN).telegram;
  }
  return telegram;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  extra?: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML" }
) {
  await ensureTelegram().sendMessage(chatId, text, extra);
}

export async function sendMessageWithKeyboard(
  chatId: number | string,
  text: string,
  keyboard: InlineKeyboardMarkup
): Promise<{ message_id: number }> {
  return ensureTelegram().sendMessage(chatId, text, { reply_markup: keyboard });
}

export async function pinMessage(chatId: number | string, messageId: number) {
  await ensureTelegram().pinChatMessage(chatId, messageId);
}

export async function unpinMessage(chatId: number | string, messageId: number) {
  await ensureTelegram().unpinChatMessage(chatId, messageId);
}
