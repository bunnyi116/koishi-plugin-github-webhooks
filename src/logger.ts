import { Context } from 'koishi'
import { PluginConfig } from './index'

export class Logger {
  private ctx: Context
  private config: PluginConfig
  private logger: ReturnType<Context['logger']>

  constructor(ctx: Context, config: PluginConfig) {
    this.ctx = ctx
    this.config = config
    this.logger = ctx.logger('github-webhooks')
  }

  info(message: string, ...args: any[]) {
    this.logger.info(message, ...args)
  }

  warn(message: string, ...args: any[]) {
    this.logger.warn(message, ...args)
  }

  error(message: string, ...args: any[]) {
    this.logger.error(message, ...args)
  }

  debug(message: string, ...args: any[]) {
    if (this.config.debug) {
      this.logger.info(`[DEBUG] ${message}`, ...args)
    }
  }
}
