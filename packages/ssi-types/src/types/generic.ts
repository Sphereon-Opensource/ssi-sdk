/**
 * Accept a Type or a Promise of that Type.
 *
 * @internal
 */
export type OrPromise<T> = T | Promise<T>
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>

export type BearerTokenArg = (() => Promise<string>) | string

/**
 * Generic structure used for validations. For instance for X509 and JWs signature checks. Allows us to create multilevel structures for complex validations
 */
export type IValidationResult = {
  /**
   * The name of the validation or its subsystem. Mainly used for information purposes. Not assumed to be unique
   */
  name: string

  /**
   * Whether the validation was successful or not
   */
  error: boolean

  /**
   * Whether an error can be ignored or not (up to processing logic)
   */
  critical: boolean

  /**
   * Any status/info message about the validation
   */
  message: string

  /**
   * The date and time of the validation
   */
  verificationTime: Date
}

export type IValidationResults = {
  /**
   * Global derived error state for easy access
   */
  error: boolean

  verifications: Array<IValidationResult>
}
