import { MAX_PROFILE_PHOTO_BYTES } from '../../domain/shared/limits';

export type UsersErrorCategory =
  | 'conflict'
  | 'not-found'
  | 'forbidden'
  | 'payload-too-large'
  | 'unsupported-media-type';

/** Safe to expose: `safeDetail` never contains identity data, secrets or internal state. */
export abstract class UsersApplicationError extends Error {
  protected constructor(
    public readonly code: string,
    public readonly category: UsersErrorCategory,
    public readonly safeDetail: string,
  ) {
    super(safeDetail);
    this.name = new.target.name;
  }
}

export class EmailAlreadyInUseError extends UsersApplicationError {
  public constructor() {
    super('EMAIL_ALREADY_IN_USE', 'conflict', 'The email cannot be used');
  }
}

export class StaleProfileVersionError extends UsersApplicationError {
  public constructor() {
    super('PROFILE_VERSION_CONFLICT', 'conflict', 'The profile was modified by another request');
  }
}

export class RegistrationConflictError extends UsersApplicationError {
  public constructor() {
    super(
      'REGISTRATION_CONFLICT',
      'conflict',
      'The registration identifier was already used with different data',
    );
  }
}

export class RegistrationStateConflictError extends UsersApplicationError {
  public constructor() {
    super(
      'REGISTRATION_STATE_CONFLICT',
      'conflict',
      'The registration cannot transition from its current state',
    );
  }
}

export class RegistrationNotFoundError extends UsersApplicationError {
  public constructor() {
    super('REGISTRATION_NOT_FOUND', 'not-found', 'The registration was not found');
  }
}

export class ProfileNotFoundError extends UsersApplicationError {
  public constructor() {
    super('PROFILE_NOT_FOUND', 'not-found', 'The profile was not found');
  }
}

export class OwnershipViolationError extends UsersApplicationError {
  public constructor() {
    super('FORBIDDEN', 'forbidden', 'You are not allowed to access this resource');
  }
}

export class PhotoTooLargeError extends UsersApplicationError {
  public constructor() {
    super(
      'PHOTO_TOO_LARGE',
      'payload-too-large',
      `The photo exceeds the ${MAX_PROFILE_PHOTO_BYTES} byte limit`,
    );
  }
}

export class UnsupportedPhotoTypeError extends UsersApplicationError {
  public constructor() {
    super('UNSUPPORTED_PHOTO_TYPE', 'unsupported-media-type', 'The photo must be JPEG or PNG');
  }
}
