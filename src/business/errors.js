export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export function requireFound(value, message) {
  if (!value) throw new AppError(message, 404);
  return value;
}
