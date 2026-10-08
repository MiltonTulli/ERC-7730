import type {
  ClearSignKind,
  Confidence,
  DecodeOptions,
  DecodeSource,
  DecodedOperation,
  DiagnosticLog,
} from './types';

export function createDiagnosticLog(): DiagnosticLog {
  const entries: DiagnosticLog['entries'][number][] = [];
  return {
    entries,
    push(entry) {
      entries.push(entry);
    },
  };
}

export interface DecodeSession {
  options: DecodeOptions;
  log: DiagnosticLog;
  started: number;
}

export function beginDecode(
  kind: ClearSignKind,
  options: DecodeOptions | undefined
): DecodeSession {
  const log = createDiagnosticLog();
  const traced: DecodeOptions = {
    ...options,
    diagnosticLog: log,
    cacheObserver: {
      hit(path) {
        options?.onEvent?.({ type: 'registry:cache-hit', path });
      },
      fetch(path, durationMs) {
        options?.onEvent?.({ type: 'registry:fetch', path, durationMs });
      },
    },
  };
  options?.onEvent?.({ type: 'decode:start', kind });
  return { options: traced, log, started: performance.now() };
}

export function endDecode(
  kind: ClearSignKind,
  options: DecodeOptions | undefined,
  session: DecodeSession,
  operation: DecodedOperation
): DecodedOperation {
  const result: DecodedOperation = { ...operation, diagnostics: session.log.entries };
  options?.onEvent?.({
    type: 'decode:end',
    kind,
    durationMs: performance.now() - session.started,
    source: result.source,
    confidence: result.confidence,
  });
  for (const warning of result.warnings) {
    options?.onEvent?.({ type: 'warning:emitted', warningType: warning.type });
  }
  return result;
}

export function failDecode(
  kind: ClearSignKind,
  options: DecodeOptions | undefined,
  started: number,
  source: DecodeSource = 'basic',
  confidence: Confidence = 'low'
): void {
  options?.onEvent?.({
    type: 'decode:end',
    kind,
    durationMs: performance.now() - started,
    source,
    confidence,
  });
}
