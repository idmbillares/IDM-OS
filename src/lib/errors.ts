export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class AuthenticationRequiredError extends DomainError {
  constructor() {
    super("Se requiere una sesión autenticada.", "AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationError extends DomainError {
  constructor() {
    super("No tienes permiso para realizar esta acción.", "FORBIDDEN");
    this.name = "AuthorizationError";
  }
}

export class ApplicationLockedError extends DomainError {
  constructor() {
    super(
      "IDM OS está bloqueado. Ingresa tu PIN personal para continuar.",
      "APP_LOCKED",
    );
    this.name = "ApplicationLockedError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}
