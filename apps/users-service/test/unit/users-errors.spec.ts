import {
  EmailAlreadyInUseError,
  OwnershipViolationError,
  PhotoTooLargeError,
  ProfileNotFoundError,
  RegistrationConflictError,
  RegistrationNotFoundError,
  RegistrationStateConflictError,
  StaleProfileVersionError,
  UnsupportedPhotoTypeError,
  UsersApplicationError,
} from '@users/application/errors/users-errors';
import {
  DomainError,
  DomainValidationError,
  InvalidStateTransitionError,
} from '@users/domain/shared/domain-error';

describe('domain errors', () => {
  it('carries field-level validation errors without HTTP semantics', () => {
    const error = new DomainValidationError([{ field: 'name', code: 'NAME_TOO_SHORT' }]);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.errors).toEqual([{ field: 'name', code: 'NAME_TOO_SHORT' }]);
    expect(error.name).toBe('DomainValidationError');
    expect(error).not.toHaveProperty('status');
  });

  it('describes a forbidden state transition', () => {
    const error = new InvalidStateTransitionError('CANCELLED', 'ACTIVE');

    expect(error.code).toBe('INVALID_STATE_TRANSITION');
    expect(error.from).toBe('CANCELLED');
    expect(error.to).toBe('ACTIVE');
  });
});

describe('application errors', () => {
  it.each([
    [new EmailAlreadyInUseError(), 'EMAIL_ALREADY_IN_USE', 'conflict'],
    [new StaleProfileVersionError(), 'PROFILE_VERSION_CONFLICT', 'conflict'],
    [new RegistrationConflictError(), 'REGISTRATION_CONFLICT', 'conflict'],
    [new RegistrationStateConflictError(), 'REGISTRATION_STATE_CONFLICT', 'conflict'],
    [new RegistrationNotFoundError(), 'REGISTRATION_NOT_FOUND', 'not-found'],
    [new ProfileNotFoundError(), 'PROFILE_NOT_FOUND', 'not-found'],
    [new OwnershipViolationError(), 'FORBIDDEN', 'forbidden'],
    [new PhotoTooLargeError(), 'PHOTO_TOO_LARGE', 'payload-too-large'],
    [new UnsupportedPhotoTypeError(), 'UNSUPPORTED_PHOTO_TYPE', 'unsupported-media-type'],
  ])('%p exposes a stable code and category', (error, code, category) => {
    expect(error).toBeInstanceOf(UsersApplicationError);
    expect(error.code).toBe(code);
    expect(error.category).toBe(category);
    expect(error.safeDetail.length).toBeGreaterThan(0);
  });

  it('distinguishes email and version conflicts by code', () => {
    expect(new EmailAlreadyInUseError().code).not.toBe(new StaleProfileVersionError().code);
  });

  it('never reveals identity data in the safe detail', () => {
    const detail = new EmailAlreadyInUseError().safeDetail.toLowerCase();

    expect(detail).not.toContain('@');
    expect(detail).not.toMatch(/exists|registered|account/);
  });

  it('uses one uniform detail for ownership violations', () => {
    expect(new OwnershipViolationError().safeDetail).toBe(
      'You are not allowed to access this resource',
    );
  });

  it('states the exact 5,000,000 byte photo limit', () => {
    expect(new PhotoTooLargeError().safeDetail).toContain('5000000');
  });
});
