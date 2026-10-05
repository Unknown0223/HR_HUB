import { Global, Module } from '@nestjs/common';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramLinksService } from './telegram-links.service';

/** Bot API client and account links, shared by notifications, auth and the webhook. */
@Global()
@Module({
  providers: [TelegramBotClient, TelegramLinksService],
  exports: [TelegramBotClient, TelegramLinksService],
})
export class TelegramCoreModule {}
