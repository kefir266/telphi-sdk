import type { Logger } from '../types'

const defaultLogger: Logger = {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
}

let _debug = defaultLogger.debug
let _info = defaultLogger.info
let _warn = defaultLogger.warn
let _error = defaultLogger.error

/**
 * Module-level singleton logger used throughout the SDK.
 * Routes to the logger supplied in `WebRTCConfig.logger`, falling back to `console`.
 */
export const logger: Logger = {
    debug: (...args) => _debug(...args),
    info: (...args) => _info(...args),
    warn: (...args) => _warn(...args),
    error: (...args) => _error(...args),
}

/**
 * Update the SDK logger. Called automatically by the store when `WebRTCConfig` is set.
 * Pass `undefined` to revert to the default `console` logger.
 */
export function setlogger(logger: Logger | undefined): void {
    _debug = logger?.debug ?? defaultLogger.debug
    _info = logger?.info ?? defaultLogger.info
    _warn = logger?.warn ?? defaultLogger.warn
    _error = logger?.error ?? defaultLogger.error
}
