export interface ViewportScrollState {
  boundaryPush: number;
  horizontalPush: number;
  arrivedBoundary: 'top' | 'bottom' | null;
  arrivedAtMs: number;
  lastEventMs: number;
  lockUntilMs: number;
}

export interface ViewportWheelInput {
  deltaX: number;
  deltaY: number;
  now: number;
  scrollY: number;
  maxScrollY: number;
  canScrollVertically: boolean;
  isFirstPage: boolean;
  isLastPage: boolean;
}

export interface ViewportWheelResult {
  nextState: ViewportScrollState;
  nextScrollY: number;
  action: 'none' | 'scroll' | 'turn-next' | 'turn-prev';
  /** Normalized 0..1 push progress against a boundary before flipping (for subtle edge feedback) */
  boundaryResistance: number;
  boundarySide: 'top' | 'bottom' | null;
}

export const BOUNDARY_MOMENTUM_GAP_MS = 140;
export const BOUNDARY_MOMENTUM_MAX_WAIT_MS = 700;
export const BOUNDARY_IDLE_RESET_MS = 460;
export const BOUNDARY_FLIP_THRESHOLD = 115;
export const FLAT_PAGE_FLIP_THRESHOLD = 155;
export const HORIZONTAL_FLIP_THRESHOLD = 95;
export const FLIP_COOLDOWN_MS = 450;

export function createInitialScrollState(): ViewportScrollState {
  return {
    boundaryPush: 0,
    horizontalPush: 0,
    arrivedBoundary: null,
    arrivedAtMs: 0,
    lastEventMs: 0,
    lockUntilMs: 0,
  };
}

/**
 * Pure decoupled viewport scroll & page-turn event processor.
 *
 * Guarantees:
 * 1. Vertical mouse/trackpad scroll ALWAYS scrolls through a tall/zoomed page's content first
 *    and NEVER triggers a page flip while room remains to scroll.
 * 2. When scrolling reaches the bottom or top boundary, residual trackpad momentum events
 *    from the same gesture are absorbed so the page never flips accidentally on arrival.
 * 3. Only a fresh, deliberate scroll past resistance at the boundary triggers a page turn.
 * 4. On the last page (isLastPage = true), downward scrolling NEVER turns past the end
 *    and NEVER opens settings.
 */
export function processViewportWheel(
  state: ViewportScrollState,
  input: ViewportWheelInput
): ViewportWheelResult {
  const {
    deltaX,
    deltaY,
    now,
    scrollY,
    maxScrollY,
    canScrollVertically,
    isFirstPage,
    isLastPage,
  } = input;

  if (now < state.lockUntilMs) {
    return {
      nextState: { ...state, lastEventMs: now },
      nextScrollY: 0,
      action: 'none',
      boundaryResistance: 0,
      boundarySide: null,
    };
  }

  const idleReset = state.lastEventMs > 0 && now - state.lastEventMs > BOUNDARY_IDLE_RESET_MS;

  // Horizontal trackpad swipe left/right turns pages explicitly (decoupled from vertical scroll)
  if (Math.abs(deltaX) > Math.abs(deltaY) * 1.4 && Math.abs(deltaX) > 8) {
    const baseHoriz = idleReset ? 0 : state.horizontalPush;
    const nextHoriz = baseHoriz + deltaX;
    if (nextHoriz >= HORIZONTAL_FLIP_THRESHOLD) {
      if (isLastPage) {
        return {
          nextState: { ...state, horizontalPush: 0, lastEventMs: now },
          nextScrollY: scrollY,
          action: 'none',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }
      return {
        nextState: {
          ...createInitialScrollState(),
          lockUntilMs: now + FLIP_COOLDOWN_MS,
          lastEventMs: now,
        },
        nextScrollY: 0,
        action: 'turn-next',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }
    if (nextHoriz <= -HORIZONTAL_FLIP_THRESHOLD) {
      if (isFirstPage) {
        return {
          nextState: { ...state, horizontalPush: 0, lastEventMs: now },
          nextScrollY: scrollY,
          action: 'none',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }
      return {
        nextState: {
          ...createInitialScrollState(),
          lockUntilMs: now + FLIP_COOLDOWN_MS,
          lastEventMs: now,
        },
        nextScrollY: 0,
        action: 'turn-prev',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }
    return {
      nextState: {
        ...state,
        horizontalPush: nextHoriz,
        boundaryPush: 0,
        lastEventMs: now,
      },
      nextScrollY: scrollY,
      action: 'none',
      boundaryResistance: 0,
      boundarySide: null,
    };
  }

  if (Math.abs(deltaY) < 1.5) {
    return {
      nextState: state,
      nextScrollY: scrollY,
      action: 'none',
      boundaryResistance: 0,
      boundarySide: null,
    };
  }

  // Case 1: Page extends beyond viewport height — scroll page content FIRST
  if (canScrollVertically && maxScrollY > 0) {
    const atBottom = scrollY >= maxScrollY - 1.5;
    const atTop = scrollY <= 1.5;

    // Scrolling DOWN while not yet at bottom
    if (deltaY > 0 && !atBottom) {
      const nextY = Math.min(maxScrollY, scrollY + deltaY * 0.9);
      const justReachedBottom = nextY >= maxScrollY - 1.5;
      return {
        nextState: {
          boundaryPush: 0,
          horizontalPush: 0,
          arrivedBoundary: justReachedBottom ? 'bottom' : null,
          arrivedAtMs: justReachedBottom ? now : 0,
          lastEventMs: now,
          lockUntilMs: state.lockUntilMs,
        },
        nextScrollY: nextY,
        action: 'scroll',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }

    // Scrolling UP while not yet at top
    if (deltaY < 0 && !atTop) {
      const nextY = Math.max(0, scrollY + deltaY * 0.9);
      const justReachedTop = nextY <= 1.5;
      return {
        nextState: {
          boundaryPush: 0,
          horizontalPush: 0,
          arrivedBoundary: justReachedTop ? 'top' : null,
          arrivedAtMs: justReachedTop ? now : 0,
          lastEventMs: now,
          lockUntilMs: state.lockUntilMs,
        },
        nextScrollY: nextY,
        action: 'scroll',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }

    // Already at BOTTOM boundary and scrolling DOWN
    if (deltaY > 0 && atBottom) {
      // Never flip past the last page (and never open settings on scroll)
      if (isLastPage) {
        return {
          nextState: {
            ...state,
            boundaryPush: 0,
            lastEventMs: now,
          },
          nextScrollY: maxScrollY,
          action: 'none',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }

      // Isolate trackpad inertia: if we just arrived at the bottom from continuous scrolling,
      // absorb rapid momentum ticks until the user pauses/re-initiates a deliberate scroll.
      if (state.arrivedBoundary === 'bottom') {
        const gapSincePrev = now - state.lastEventMs;
        const elapsedSinceArrival = now - state.arrivedAtMs;
        if (gapSincePrev < BOUNDARY_MOMENTUM_GAP_MS && elapsedSinceArrival < BOUNDARY_MOMENTUM_MAX_WAIT_MS) {
          return {
            nextState: {
              ...state,
              boundaryPush: 0,
              lastEventMs: now,
            },
            nextScrollY: maxScrollY,
            action: 'none',
            boundaryResistance: 0,
            boundarySide: 'bottom',
          };
        }
      }

      const basePush = idleReset || state.boundaryPush < 0 ? 0 : state.boundaryPush;
      const nextPush = basePush + deltaY;
      if (nextPush >= BOUNDARY_FLIP_THRESHOLD) {
        return {
          nextState: {
            ...createInitialScrollState(),
            lockUntilMs: now + FLIP_COOLDOWN_MS,
            lastEventMs: now,
          },
          nextScrollY: 0,
          action: 'turn-next',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }

      return {
        nextState: {
          boundaryPush: nextPush,
          horizontalPush: 0,
          arrivedBoundary: null,
          arrivedAtMs: 0,
          lastEventMs: now,
          lockUntilMs: state.lockUntilMs,
        },
        nextScrollY: maxScrollY,
        action: 'none',
        boundaryResistance: Math.min(1, nextPush / BOUNDARY_FLIP_THRESHOLD),
        boundarySide: 'bottom',
      };
    }

    // Already at TOP boundary and scrolling UP
    if (deltaY < 0 && atTop) {
      if (isFirstPage) {
        return {
          nextState: {
            ...state,
            boundaryPush: 0,
            lastEventMs: now,
          },
          nextScrollY: 0,
          action: 'none',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }

      if (state.arrivedBoundary === 'top') {
        const gapSincePrev = now - state.lastEventMs;
        const elapsedSinceArrival = now - state.arrivedAtMs;
        if (gapSincePrev < BOUNDARY_MOMENTUM_GAP_MS && elapsedSinceArrival < BOUNDARY_MOMENTUM_MAX_WAIT_MS) {
          return {
            nextState: {
              ...state,
              boundaryPush: 0,
              lastEventMs: now,
            },
            nextScrollY: 0,
            action: 'none',
            boundaryResistance: 0,
            boundarySide: 'top',
          };
        }
      }

      const basePush = idleReset || state.boundaryPush > 0 ? 0 : state.boundaryPush;
      const nextPush = basePush + deltaY;
      if (nextPush <= -BOUNDARY_FLIP_THRESHOLD) {
        return {
          nextState: {
            ...createInitialScrollState(),
            lockUntilMs: now + FLIP_COOLDOWN_MS,
            lastEventMs: now,
          },
          nextScrollY: 0,
          action: 'turn-prev',
          boundaryResistance: 0,
          boundarySide: null,
        };
      }

      return {
        nextState: {
          boundaryPush: nextPush,
          horizontalPush: 0,
          arrivedBoundary: null,
          arrivedAtMs: 0,
          lastEventMs: now,
          lockUntilMs: state.lockUntilMs,
        },
        nextScrollY: 0,
        action: 'none',
        boundaryResistance: Math.min(1, Math.abs(nextPush) / BOUNDARY_FLIP_THRESHOLD),
        boundarySide: 'top',
      };
    }
  }

  // Case 2: Whole page fits vertically on screen (both top & bottom already visible).
  // Require a firm, deliberate push above threshold (decoupled from single accidental ticks),
  // and hard-stop cleanly at first and last page.
  const directionChanged =
    (deltaY > 0 && state.boundaryPush < 0) || (deltaY < 0 && state.boundaryPush > 0);
  const basePush = idleReset || directionChanged ? 0 : state.boundaryPush;
  const nextPush = basePush + deltaY;

  if (nextPush >= FLAT_PAGE_FLIP_THRESHOLD) {
    if (isLastPage) {
      return {
        nextState: { ...state, boundaryPush: 0, lastEventMs: now },
        nextScrollY: scrollY,
        action: 'none',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }
    return {
      nextState: {
        ...createInitialScrollState(),
        lockUntilMs: now + FLIP_COOLDOWN_MS,
        lastEventMs: now,
      },
      nextScrollY: 0,
      action: 'turn-next',
      boundaryResistance: 0,
      boundarySide: null,
    };
  }

  if (nextPush <= -FLAT_PAGE_FLIP_THRESHOLD) {
    if (isFirstPage) {
      return {
        nextState: { ...state, boundaryPush: 0, lastEventMs: now },
        nextScrollY: scrollY,
        action: 'none',
        boundaryResistance: 0,
        boundarySide: null,
      };
    }
    return {
      nextState: {
        ...createInitialScrollState(),
        lockUntilMs: now + FLIP_COOLDOWN_MS,
        lastEventMs: now,
      },
      nextScrollY: 0,
      action: 'turn-prev',
      boundaryResistance: 0,
      boundarySide: null,
    };
  }

  return {
    nextState: {
      boundaryPush: nextPush,
      horizontalPush: 0,
      arrivedBoundary: null,
      arrivedAtMs: 0,
      lastEventMs: now,
      lockUntilMs: state.lockUntilMs,
    },
    nextScrollY: scrollY,
    action: 'none',
    boundaryResistance: Math.min(1, Math.abs(nextPush) / FLAT_PAGE_FLIP_THRESHOLD),
    boundarySide: deltaY > 0 ? 'bottom' : 'top',
  };
}
