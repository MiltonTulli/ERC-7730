export class DescriptorResolveError extends Error {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'DescriptorResolveError';
    this.path = path;
  }
}
