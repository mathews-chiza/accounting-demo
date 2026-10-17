
type ResultType =
  | 'Success'
  | 'Not Found'
  | 'Unknown'
  | 'Validation'
  | 'Unauthorized'
  | 'Conflict';

export default class ApiResult<T = any> {
  public readonly success: boolean;
  public readonly totalPages: number | null;

  constructor(
    public type: ResultType,
    public message: string = '',
    public data?: T,
    public readonly totalCount: number | null = null,
    public readonly pageSize: number | null = null,
  ) {
    this.success = type === 'Success';
    this.totalPages =
      totalCount && pageSize ? Math.ceil(totalCount / pageSize) : null;
  }

  static success<T>(data?: T, totalCount?: number, pageSize?: number) {
    return new ApiResult<T>(
      'Success',
      '',
      data,
      totalCount,
      pageSize,
    );
  }

  static successWithMessage<T>(message: string, data?: T) {
    return new ApiResult<T>(
      'Success',
      message,
      data,
    );
  }

  static failed(type: ResultType, message?: string) {
    return new ApiResult(type, message);
  }

  static notFound(messageOrEntity?: string) {
    // If no argument, use default message
    if (!messageOrEntity) {
      return new ApiResult('Not Found', 'Entity not found');
    }
    // If the argument looks like an entity name (single word, capitalized), append 'not found'
    if (/^[A-Z][a-zA-Z0-9]*$/.test(messageOrEntity)) {
      return new ApiResult('Not Found', `${messageOrEntity} not found`);
    }
    // Otherwise, treat as a custom message
    return new ApiResult('Not Found', messageOrEntity);
  }

  static unauthorized(message?: string) {
    return new ApiResult(
      'Unauthorized',
      message || 'You are not authorized to perform this action',
    );
  }

  static conflict(message?: string) {
    return new ApiResult('Conflict', message || 'Conflict occurred');
  }
}
