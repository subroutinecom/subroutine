import winston from "winston";

const rootLogger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.json(),
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
export const getLogger = (name: string, level?: string): winston.Logger => {
  const childLogger = rootLogger.child({ module: name });
  if (level) {
    childLogger.level = level;
  }
  return childLogger;
};
