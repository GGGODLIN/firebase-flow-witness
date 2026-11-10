import {
  createInitialStudioState,
  studioReducer,
  type StudioAction,
  type StudioState,
} from '../core/studio-model.ts';

export interface StudioStore {
  readonly getState: () => StudioState;
  readonly dispatch: (action: StudioAction) => StudioState;
  readonly subscribe: (listener: () => void) => () => void;
}

// A synchronous store instead of useReducer: async run flows must read the
// activeRunId produced by their own START_RUN before React re-renders, otherwise
// the BEAT1/BEAT2 epoch fence would compare against a stale id.
export function createStudioStore(
  initial: StudioState = createInitialStudioState(),
): StudioStore {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch: (action) => {
      state = studioReducer(state, action);
      for (const listener of listeners) {
        listener();
      }
      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
