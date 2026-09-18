export class OfficialRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficialRegistryError';
  }
}
