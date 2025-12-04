import winston from "winston";

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf((info: any) => {
  const { level, message, module, timestamp, stack, ...meta } = info;
  let log = `${timestamp} [${level}]`;
  if (module) {
    log += ` [${module}]`;
  }
  log += `: ${message}`;

  if (stack) {
    log += `\n${stack}`;
  }

  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }

  return log;
});

const rootLogger = winston.createLogger({
  level: "debug", // Set to debug to allow child loggers to use debug level
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp({ format: "HH:mm:ss" }),
        colorize(),
        errors({ stack: true }),
        logFormat
      ),
    }),
  ],
});

/**
 * Returns a logger instance for the given module name.
 *
 * @param name - The name of the module (e.g. "api.server")
 * @param level - Optional log level override for this logger
 * @returns A Winston logger instance
 */
export const getLogger = (
  name: string,
  level: "debug" | "info" | "warn" | "error" = "info"
): winston.Logger => {
  const childLogger = rootLogger.child({ module: name });
  childLogger.level = level;
  return childLogger;
};
