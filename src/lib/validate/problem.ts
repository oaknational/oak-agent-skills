export interface Problem {
  // A path relative to the repository root, optionally with :line.
  file: string;
  message: string;
}
