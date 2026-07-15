// AGAPAY Accounting Package 0.75E -- Accounting-domain error taxonomy.
//
// These errors establish the vocabulary future accounting services use at
// the domain boundary. They intentionally contain no ledger behavior.

export class AccountingError extends Error {
  constructor(message, { code = "accounting_error", status = 500, details = {} } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AuthorizationError extends AccountingError {
  constructor(message = "Accounting authorization failed.", options = {}) {
    super(message, { code: "accounting_authorization_error", status: 401, ...options });
  }
}

export class CapabilityDeniedError extends AuthorizationError {
  constructor(message = "Required accounting capability is not granted.", options = {}) {
    super(message, { code: "accounting_capability_denied", status: 403, ...options });
  }
}

export class AccountingConfigurationError extends AccountingError {
  constructor(message = "Accounting is not configured for this parish.", options = {}) {
    super(message, { code: "accounting_configuration_error", status: 409, ...options });
  }
}

export class AccountingDatabaseError extends AccountingError {
  constructor(message = "Accounting database resolution failed.", options = {}) {
    super(message, { code: "accounting_database_error", status: 503, ...options });
  }
}

export class ClosedPeriodError extends AccountingError {
  constructor(message = "The accounting period is closed.", options = {}) {
    super(message, { code: "accounting_closed_period", status: 409, ...options });
  }
}

export class ValidationError extends AccountingError {
  constructor(message = "Accounting validation failed.", options = {}) {
    super(message, { code: "accounting_validation_error", status: 422, ...options });
  }
}

export class MappingError extends AccountingError {
  constructor(message = "Accounting mapping is missing or invalid.", options = {}) {
    super(message, { code: "accounting_mapping_error", status: 409, ...options });
  }
}

export class PostingError extends AccountingError {
  constructor(message = "Accounting posting failed.", options = {}) {
    super(message, { code: "accounting_posting_error", status: 409, ...options });
  }
}

export class DuplicatePostingError extends PostingError {
  constructor(message = "Accounting posting would duplicate a prior posting.", options = {}) {
    super(message, { code: "accounting_duplicate_posting", status: 409, ...options });
  }
}

export class MigrationError extends AccountingError {
  constructor(message = "Accounting migration failed.", options = {}) {
    super(message, { code: "accounting_migration_error", status: 500, ...options });
  }
}

export class DomainBoundaryError extends AccountingError {
  constructor(message = "Accounting domain boundary was bypassed.", options = {}) {
    super(message, { code: "accounting_domain_boundary_error", status: 500, ...options });
  }
}
