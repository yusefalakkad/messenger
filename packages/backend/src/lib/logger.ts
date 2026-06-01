import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, colorize, printf, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), json());

// В контейнере пишем только в stdout/stderr — их подхватывает `docker logs`
// с ротацией через json-file driver (см. /etc/docker/daemon.json).
// File-transport убран чтобы (а) не падать под non-root в /app, (б) не плодить
// unbounded файлы внутри образа (audit M2).
export const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: config.isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});
